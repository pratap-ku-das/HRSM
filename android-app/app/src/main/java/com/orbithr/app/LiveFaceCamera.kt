package com.orbithr.app

import android.annotation.SuppressLint
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

private enum class BlinkStage { FIND_FACE, OPEN, CLOSED, VERIFIED }

@SuppressLint("UnsafeOptInUsageError")
@Composable
fun LiveFaceCamera(onVerified: () -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val view = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val detector = remember { FaceDetection.getClient(FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .setMinFaceSize(.25f).build()) }
    var message by remember { mutableStateOf("Center your face and look forward") }
    val done = remember { AtomicBoolean(false) }
    val stage = remember { arrayOf(BlinkStage.FIND_FACE) }

    DisposableEffect(owner) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { frame ->
                val image = frame.image
                if (image == null || done.get()) { frame.close(); return@setAnalyzer }
                detector.process(InputImage.fromMediaImage(image, frame.imageInfo.rotationDegrees))
                    .addOnSuccessListener { faces ->
                        val face = faces.singleOrNull()
                        val centered = face != null && abs(face.headEulerAngleY) < 18 && abs(face.headEulerAngleZ) < 18
                        val left = face?.leftEyeOpenProbability ?: -1f
                        val right = face?.rightEyeOpenProbability ?: -1f
                        val open = left > .65f && right > .65f
                        val closed = left in 0f..<.35f && right in 0f..<.35f
                        when {
                            !centered -> { stage[0] = BlinkStage.FIND_FACE; message = if (faces.size > 1) "Only one person may be visible" else "Center your face and look forward" }
                            stage[0] == BlinkStage.FIND_FACE && open -> { stage[0] = BlinkStage.OPEN; message = "Blink now" }
                            stage[0] == BlinkStage.OPEN && closed -> { stage[0] = BlinkStage.CLOSED; message = "Open your eyes" }
                            stage[0] == BlinkStage.CLOSED && open && done.compareAndSet(false, true) -> { stage[0] = BlinkStage.VERIFIED; onVerified() }
                        }
                    }.addOnCompleteListener { frame.close() }
            }
            provider.unbindAll()
            provider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(context))
        onDispose {
            if (future.isDone) runCatching { future.get().unbindAll() }
            detector.close()
            executor.shutdown()
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView({ view }, modifier = Modifier.fillMaxSize())
        IconButton(onCancel, Modifier.align(Alignment.TopEnd).padding(20.dp)) {
            Icon(Icons.Default.Close, "Cancel verification", tint = Color.White)
        }
        Column(Modifier.align(Alignment.BottomCenter).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(message, color = Color.White, fontSize = 20.sp, modifier = Modifier.background(Color.Black.copy(alpha = .65f)).padding(16.dp))
            Text("Keep the phone steady - live GPS is checked next", color = Color.White.copy(alpha = .8f), modifier = Modifier.padding(top = 10.dp))
        }
    }
}
