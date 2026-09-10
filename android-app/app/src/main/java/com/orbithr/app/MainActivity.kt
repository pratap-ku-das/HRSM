package com.orbithr.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.orbithr.app.core.model.AttendanceVerificationResult
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.data.userMessage
import com.orbithr.app.ui.OrbitTheme
import com.orbithr.app.ui.RootApp
import dagger.hilt.android.AndroidEntryPoint
import java.security.MessageDigest
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    @Inject lateinit var repository: OrbitRepository
    private var pendingVerification: ((AttendanceVerificationResult) -> Unit)? = null
    private var pendingAction: String? = null
    private var showLiveCamera by mutableStateOf(false)

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true && grants[Manifest.permission.CAMERA] == true) captureFace()
        else finishVerification(AttendanceVerificationResult.Failed("Camera and precise location permissions are required. Attendance remains disabled."))
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
                if (showLiveCamera) LiveFaceCamera(
                    onVerified = { selfie -> showLiveCamera = false; requestPreciseLocation(selfie) },
                    onFailure = { message -> finishVerification(AttendanceVerificationResult.Failed(message)) },
                    onCancel = { finishVerification(AttendanceVerificationResult.Failed("Live face verification was cancelled.")) },
                )
            }
        }
    }

    private fun verifyFaceAndLocation(action: String, callback: (AttendanceVerificationResult) -> Unit) {
        pendingVerification?.invoke(AttendanceVerificationResult.Failed("A newer verification request replaced this one."))
        pendingVerification = callback
        pendingAction = action

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

    private fun captureFace() { showLiveCamera = true }

    private fun requestPreciseLocation(selfie: ByteArray) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            finishVerification(AttendanceVerificationResult.Failed("Precise location permission was removed. Attendance remains disabled."))
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
                    else -> {
                        val action = pendingAction
                        if (action == null) {
                            finishVerification(AttendanceVerificationResult.Failed("Verification state was lost. Please try again."))
                        } else lifecycleScope.launch {
                            runCatching { repository.verifyFace(action, selfie, location.latitude, location.longitude, location.accuracy, hashedDeviceId()) }
                                .onSuccess { proof -> finishVerification(AttendanceVerificationResult.Verified(proof)) }
                                .onFailure { error -> finishVerification(AttendanceVerificationResult.Failed(error.userMessage())) }
                        }
                    }
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
        showLiveCamera = false
        val callback = pendingVerification
        pendingVerification = null
        pendingAction = null
        callback?.invoke(result)
    }
}
