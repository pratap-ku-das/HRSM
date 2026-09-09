package com.orbithr.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.orbithr.app.core.model.AttendanceVerificationProof
import com.orbithr.app.core.model.AttendanceVerificationResult
import com.orbithr.app.ui.OrbitTheme
import com.orbithr.app.ui.RootApp
import dagger.hilt.android.AndroidEntryPoint
import java.security.MessageDigest

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    private var pendingVerification: ((AttendanceVerificationResult) -> Unit)? = null

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true && grants[Manifest.permission.CAMERA] == true) captureFace()
        else finishVerification(AttendanceVerificationResult.Failed("Camera and precise location permissions are required. Clock-in remains disabled."))
    }

    private val faceCaptureLauncher = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap == null) {
            finishVerification(AttendanceVerificationResult.Failed("Face capture was cancelled. Clock-in remains disabled."))
            return@registerForActivityResult
        }
        val options = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .build()
        val detector = FaceDetection.getClient(options)
        detector.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { faces ->
                detector.close()
                val face = faces.singleOrNull()
                val eyesOpen = (face?.leftEyeOpenProbability ?: 0f) >= 0.55f && (face?.rightEyeOpenProbability ?: 0f) >= 0.55f
                val facingCamera = face != null && kotlin.math.abs(face.headEulerAngleY) <= 20f && kotlin.math.abs(face.headEulerAngleZ) <= 20f
                if (face == null || !eyesOpen || !facingCamera) {
                    finishVerification(AttendanceVerificationResult.Failed("Show one clear, front-facing face with both eyes open and try again."))
                } else authenticateFace()
            }
            .addOnFailureListener { error ->
                detector.close()
                finishVerification(AttendanceVerificationResult.Failed("Face detection failed: ${error.message ?: "unknown error"}"))
            }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OrbitTheme {
                val vm: MainViewModel = hiltViewModel()
                val state by vm.state.collectAsState()
                val error by vm.error.collectAsState()
                RootApp(state, error, vm::login, vm::logout, ::verifyFaceAndLocation)
            }
        }
    }

    private fun verifyFaceAndLocation(callback: (AttendanceVerificationResult) -> Unit) {
        pendingVerification?.invoke(AttendanceVerificationResult.Failed("A newer verification request replaced this one."))
        pendingVerification = callback

        val supportsFace = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_FACE)
        if (!supportsFace) {
            finishVerification(AttendanceVerificationResult.Failed("This phone does not expose supported face authentication. Enroll face unlock or use a supported device."))
            return
        }

        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FRONT)) {
            finishVerification(AttendanceVerificationResult.Failed("A front-facing camera is required for face attendance."))
            return
        }

        val hasLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCamera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (!hasLocation || !hasCamera) {
            locationPermissionLauncher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            return
        }
        captureFace()
    }

    private fun captureFace() = faceCaptureLauncher.launch(null)

    private fun authenticateFace() {
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_WEAK
        when (BiometricManager.from(this).canAuthenticate(authenticators)) {
            BiometricManager.BIOMETRIC_SUCCESS -> Unit
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                finishVerification(AttendanceVerificationResult.Failed("No face is enrolled on this phone. Add face unlock in Android Settings first."))
                return
            }
            else -> {
                finishVerification(AttendanceVerificationResult.Failed("Face authentication is unavailable on this phone."))
                return
            }
        }

        val executor = ContextCompat.getMainExecutor(this)
        val prompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                requestPreciseLocation()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                finishVerification(AttendanceVerificationResult.Failed("Face verification was not completed: $errString"))
            }

            override fun onAuthenticationFailed() {
                // The system prompt remains open so the employee can present their face again.
            }
        })
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Verify face to clock in")
            .setSubtitle("OrbitHR requires your enrolled face and current location")
            .setAllowedAuthenticators(authenticators)
            .setNegativeButtonText("Cancel")
            .build()
        prompt.authenticate(promptInfo)
    }

    private fun requestPreciseLocation() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            finishVerification(AttendanceVerificationResult.Failed("Precise location permission was removed. Clock-in remains disabled."))
            return
        }

        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMaxUpdateAgeMillis(5_000)
            .setDurationMillis(15_000)
            .build()
        val cancellation = CancellationTokenSource()
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(request, cancellation.token)
            .addOnSuccessListener { location ->
                when {
                    location == null -> finishVerification(AttendanceVerificationResult.Failed("Current location could not be obtained. Turn on GPS and try again."))
                    LocationCompat.isMock(location) -> finishVerification(AttendanceVerificationResult.Failed("Mock locations are not accepted for attendance."))
                    !location.hasAccuracy() || location.accuracy > 200f -> finishVerification(AttendanceVerificationResult.Failed("Location accuracy is too low (${location.accuracy.toInt()} m). Move near a window and try again."))
                    else -> finishVerification(AttendanceVerificationResult.Verified(AttendanceVerificationProof(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracyMeters = location.accuracy,
                        deviceId = hashedDeviceId(),
                        verifiedAtMillis = System.currentTimeMillis(),
                    )))
                }
            }
            .addOnFailureListener { error ->
                finishVerification(AttendanceVerificationResult.Failed("Location verification failed: ${error.message ?: "unknown error"}"))
            }
    }

    private fun hashedDeviceId(): String {
        val rawId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
        return MessageDigest.getInstance("SHA-256").digest(rawId.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    private fun finishVerification(result: AttendanceVerificationResult) {
        val callback = pendingVerification
        pendingVerification = null
        callback?.invoke(result)
    }
}
