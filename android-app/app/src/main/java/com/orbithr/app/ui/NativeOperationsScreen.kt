package com.orbithr.app.ui

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Announcement
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.orbithr.app.core.model.PendingFile

@Composable
fun NativeOperationsScreen(back: () -> Unit, vm: OperationsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val opened by vm.opened.collectAsState()
    val context = LocalContext.current
    var tab by remember { mutableStateOf("DOCUMENTS") }
    var upload by remember { mutableStateOf(false) }
    LaunchedEffect(opened) {
        opened?.let { document ->
            runCatching {
                val uri = Uri.parse(document.uri)
                context.startActivity(Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, document.mimeType)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                })
            }
            vm.consumeOpened()
        }
    }
    Page("COMPANY", "Company workspace", "Documents, holidays, announcements, assets and audit activity", action = {
        Row {
            OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack, "Back", back)
            OrbitIconButton(Icons.Outlined.Refresh, "Refresh", vm::refresh)
            if (state.data?.canManage == true) OrbitIconButton(Icons.Outlined.Add, "Upload company document") { upload = true }
        }
    }) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            items(listOf("DOCUMENTS", "HOLIDAYS", "NEWS", "ASSETS", "AUDIT")) { value ->
                FilterChip(selected = tab == value, onClick = { tab = value }, label = { Text(value) })
            }
        }
        Spacer(Modifier.height(10.dp))
        StateBody(state, vm::refresh) { data ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
                state.error?.let { item { Text(it, color = OrbitRose) } }
                when (tab) {
                    "DOCUMENTS" -> items(data.documents, key = { it.id }) { item ->
                        OrbitListItem(
                            headline = { Text(item.title, fontWeight = FontWeight.Bold) },
                            supporting = { Text("${item.category} - ${item.fileName ?: "Legacy document"}") },
                            leading = { Icon(Icons.Outlined.Description, null, tint = OrbitViolet) },
                            onClick = { if (item.fileName != null) vm.open(item.id) },
                        )
                    }
                    "HOLIDAYS" -> items(data.holidays, key = { it.id }) { item ->
                        OrbitListItem(
                            headline = { Text(item.name, fontWeight = FontWeight.Bold) },
                            supporting = { Text("${item.type} - ${item.date.take(10)}") },
                            leading = { Icon(Icons.Outlined.Event, null, tint = OrbitMint) },
                        )
                    }
                    "NEWS" -> items(data.announcements, key = { it.id }) { item ->
                        OrbitListItem(
                            headline = { Text(item.title, fontWeight = FontWeight.Bold) },
                            supporting = { Text(item.content, maxLines = 3) },
                            leading = { Icon(Icons.Outlined.Announcement, null, tint = OrbitAmber) },
                            trailing = { OrbitStatusBadge(item.priority, orbitStatusColor(item.priority)) },
                        )
                    }
                    "ASSETS" -> items(data.assets, key = { it.id }) { item ->
                        OrbitListItem(
                            headline = { Text(item.name, fontWeight = FontWeight.Bold) },
                            supporting = { Text("${item.category} - ${item.serialNumber}\n${item.condition}") },
                            leading = { Icon(Icons.Outlined.Devices, null, tint = OrbitCyan) },
                            trailing = { OrbitStatusBadge(item.status, orbitStatusColor(item.status)) },
                        )
                    }
                    else -> items(data.auditLogs, key = { it.id }) { item ->
                        OrbitListItem(
                            headline = { Text(item.action.replace('_', ' '), fontWeight = FontWeight.Bold) },
                            supporting = { Text("${item.category} - ${item.details}\n${item.timestamp.take(16)}", maxLines = 3) },
                            leading = { Icon(Icons.Outlined.History, null, tint = OrbitViolet) },
                        )
                    }
                }
            }
        }
    }
    if (upload) CompanyDocumentUploadDialog({ upload = false }) { vm.upload(it); upload = false }
}

@Composable
private fun CompanyDocumentUploadDialog(dismiss: () -> Unit, submit: (PendingFile) -> Unit) {
    val context = LocalContext.current
    var title by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("POLICY") }
    var selected by remember { mutableStateOf<PendingFile?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val resolver = context.contentResolver
            val fileName = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0) else null
            } ?: "company-document"
            val mime = resolver.getType(uri) ?: "application/octet-stream"
            val allowed = setOf("application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            require(mime in allowed) { "Choose a PDF, JPG, PNG, DOC, or DOCX file." }
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("The selected file could not be read.")
            require(bytes.size <= 20 * 1024 * 1024) { "The document must be 20 MB or smaller." }
            selected = PendingFile(title.trim(), category.trim(), fileName, mime, bytes)
            error = null
        }.onFailure { error = it.message }
    }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("Upload company document") },
        text = {
            androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Document title") }, singleLine = true)
                OutlinedTextField(category, { category = it.uppercase() }, Modifier.fillMaxWidth(), label = { Text("Category") }, singleLine = true)
                Button(onClick = { picker.launch(arrayOf("application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) }, enabled = title.trim().length >= 2 && category.trim().length >= 2) {
                    Text(if (selected == null) "Choose document" else "Replace document")
                }
                selected?.let { Text(it.fileName, color = OrbitMint, style = MaterialTheme.typography.bodySmall) }
                error?.let { Text(it, color = OrbitRose, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(onClick = { selected?.let { submit(it.copy(title = title.trim(), category = category.trim())) } }, enabled = selected != null) { Text("Upload") }
        },
        dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } },
    )
}
