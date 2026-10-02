package com.orbithr.app.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.data.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject

private val DarkCardBg = Color(0xFF1D2145)

sealed class PdfViewerUiState {
  data object Loading : PdfViewerUiState()
  data class Success(val file: File, val pages: List<Bitmap>, val pageCount: Int) : PdfViewerUiState()
  data class Error(val message: String) : PdfViewerUiState()
}

@HiltViewModel
class PdfViewerViewModel @Inject constructor(
  private val repository: OrbitRepository
) : ViewModel() {

  private val _state = MutableStateFlow<PdfViewerUiState>(PdfViewerUiState.Loading)
  val state = _state.asStateFlow()

  private var activeFile: File? = null

  fun loadDocument(type: String, documentId: String) {
    viewModelScope.launch {
      _state.value = PdfViewerUiState.Loading
      try {
        val file = withContext(Dispatchers.IO) {
          if (type.equals("FORM16", ignoreCase = true)) {
            repository.fetchForm16PdfFile(documentId)
          } else {
            repository.fetchPayslipPdfFile(documentId)
          }
        }
        activeFile = file

        val bitmaps = withContext(Dispatchers.IO) {
          renderPdfPages(file)
        }

        _state.value = PdfViewerUiState.Success(
          file = file,
          pages = bitmaps,
          pageCount = bitmaps.size
        )
      } catch (t: Throwable) {
        _state.value = PdfViewerUiState.Error(t.userMessage())
      }
    }
  }

  private fun renderPdfPages(file: File): List<Bitmap> {
    val list = mutableListOf<Bitmap>()
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val renderer = PdfRenderer(pfd)
    try {
      val count = renderer.pageCount
      for (i in 0 until count) {
        val page = renderer.openPage(i)
        // High quality 2.0x supersampling for crisp text
        val width = (page.width * 2.0f).toInt()
        val height = (page.height * 2.0f).toInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(AndroidColor.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()
        list.add(bitmap)
      }
    } finally {
      renderer.close()
      pfd.close()
    }
    return list
  }

  override fun onCleared() {
    super.onCleared()
    // Secure ephemeral cleanup: do not retain sensitive payroll PDFs in cache
    activeFile?.delete()
  }
}

@Composable
fun PdfViewerScreen(
  title: String,
  type: String,
  documentId: String,
  onBack: () -> Unit,
  viewModel: PdfViewerViewModel = hiltViewModel()
) {
  val context = LocalContext.current
  val state by viewModel.state.collectAsState()

  LaunchedEffect(type, documentId) {
    viewModel.loadDocument(type, documentId)
  }

  Scaffold(
    topBar = {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .background(OrbitHeroBrush)
          .statusBarsPadding()
          .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = Color.White)
        }
        Spacer(Modifier.width(8.dp))
        Text(
          text = title,
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.Bold,
          color = Color.White,
          modifier = Modifier.weight(1f),
          maxLines = 1,
          overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
        )
        if (state is PdfViewerUiState.Success) {
          val file = (state as PdfViewerUiState.Success).file
          IconButton(onClick = { sharePdf(context, file, title) }) {
            Icon(Icons.Outlined.Share, contentDescription = "Share PDF", tint = Color.White)
          }
          IconButton(onClick = { downloadPdf(context, file, title) }) {
            Icon(Icons.Outlined.Download, contentDescription = "Download PDF", tint = Color.White)
          }
        }
      }
    },
    containerColor = OrbitCloud
  ) { padding ->
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
    ) {
      when (val s = state) {
        is PdfViewerUiState.Loading -> {
          Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
          ) {
            CircularProgressIndicator(color = OrbitCyan)
            Spacer(Modifier.height(16.dp))
            Text("Loading authenticated document...", style = MaterialTheme.typography.bodyMedium, color = OrbitMuted)
            Text("Rendering native PDF pages", style = MaterialTheme.typography.labelSmall, color = OrbitMuted)
          }
        }

        is PdfViewerUiState.Error -> {
          Column(
            modifier = Modifier
              .fillMaxSize()
              .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
          ) {
            Text(
              "Unable to load document",
              style = MaterialTheme.typography.titleMedium,
              fontWeight = FontWeight.Bold,
              color = OrbitInk
            )
            Spacer(Modifier.height(8.dp))
            Text(s.message, style = MaterialTheme.typography.bodySmall, color = OrbitRose)
            Spacer(Modifier.height(20.dp))
            Button(
              onClick = { viewModel.loadDocument(type, documentId) },
              colors = ButtonDefaults.buttonColors(containerColor = OrbitCyan, contentColor = OrbitInk)
            ) {
              Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
              Spacer(Modifier.width(8.dp))
              Text("Retry")
            }
          }
        }

        is PdfViewerUiState.Success -> {
          var scale by remember { mutableFloatStateOf(1f) }
          var offsetX by remember { mutableFloatStateOf(0f) }
          var offsetY by remember { mutableFloatStateOf(0f) }
          val listState = rememberLazyListState()

          Box(
            modifier = Modifier
              .fillMaxSize()
              .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                  scale = (scale * zoom).coerceIn(1f, 4f)
                  if (scale > 1f) {
                    offsetX += pan.x
                    offsetY += pan.y
                  } else {
                    offsetX = 0f
                    offsetY = 0f
                  }
                }
              }
          ) {
            LazyColumn(
              state = listState,
              modifier = Modifier
                .fillMaxSize()
                .graphicsLayer(
                  scaleX = scale,
                  scaleY = scale,
                  translationX = offsetX,
                  translationY = offsetY
                ),
              contentPadding = PaddingValues(16.dp),
              verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
              itemsIndexed(s.pages) { index, bitmap ->
                Column(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalAlignment = Alignment.CenterHorizontally
                ) {
                  Surface(
                    shape = RoundedCornerShape(8.dp),
                    shadowElevation = 6.dp,
                    color = Color.White,
                    modifier = Modifier.fillMaxWidth()
                  ) {
                    Image(
                      bitmap = bitmap.asImageBitmap(),
                      contentDescription = "Page ${index + 1}",
                      modifier = Modifier.fillMaxWidth()
                    )
                  }
                  Spacer(Modifier.height(6.dp))
                  Text(
                    text = "Page ${index + 1} of ${s.pageCount}",
                    style = MaterialTheme.typography.labelSmall,
                    color = OrbitMuted
                  )
                }
              }
            }

            // Quick Zoom Reset Indicator if zoomed in
            if (scale > 1.05f) {
              Surface(
                shape = RoundedCornerShape(20.dp),
                color = DarkCardBg.copy(alpha = 0.85f),
                modifier = Modifier
                  .align(Alignment.BottomCenter)
                  .padding(bottom = 24.dp)
              ) {
                TextButton(onClick = {
                  scale = 1f
                  offsetX = 0f
                  offsetY = 0f
                }) {
                  Text("Reset Zoom (${(scale * 100).toInt()}%)", color = OrbitCyan, style = MaterialTheme.typography.labelMedium)
                }
              }
            }
          }
        }
      }
    }
  }
}

private fun sharePdf(context: Context, file: File, title: String) {
  try {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
      type = "application/pdf"
      putExtra(Intent.EXTRA_STREAM, uri)
      putExtra(Intent.EXTRA_SUBJECT, title)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Share $title"))
  } catch (e: Exception) {
    Toast.makeText(context, "Could not share PDF: ${e.message}", Toast.LENGTH_LONG).show()
  }
}

private fun downloadPdf(context: Context, file: File, title: String) {
  try {
    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    val sanitizedTitle = title.replace(Regex("[^a-zA-Z0-9._-]"), "_")
    val destination = File(downloadsDir, "$sanitizedTitle.pdf")

    file.inputStream().use { input ->
      FileOutputStream(destination).use { output ->
        input.copyTo(output)
      }
    }

    Toast.makeText(context, "Saved to Downloads: ${destination.name}", Toast.LENGTH_LONG).show()
  } catch (e: Exception) {
    Toast.makeText(context, "Failed to save: ${e.message}", Toast.LENGTH_LONG).show()
  }
}
