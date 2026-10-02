package com.orbithr.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.orbithr.app.core.model.MeDto

@Composable
fun NativeProfileScreen(me: MeDto, back: () -> Unit) {
    Page("MY ACCOUNT", "Profile", "Personal and employment information", action = {
        OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack, "Back", back)
    }) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                OrbitGlassCard(Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.Person, null, tint = OrbitViolet)
                    Text(me.user.fullName, style = MaterialTheme.typography.titleLarge)
                    Text(me.user.email, color = OrbitMuted)
                    OrbitStatusBadge(me.user.role.replace('_', ' '), OrbitCyan)
                }
            }
            me.employee?.let { employee ->
                item { DetailCard("Employee ID", employee.employeeCode) }
                item { DetailCard("Department", employee.department?.name ?: "Not assigned") }
                item { DetailCard("Designation", employee.designation?.title ?: "Not assigned") }
                item { DetailCard("Work email", employee.email) }
                item { DetailCard("Phone", employee.phone ?: "Not provided") }
                item { DetailCard("Work location", employee.workLocation ?: "Not assigned") }
                item { DetailCard("Employment status", employee.status.replace('_', ' ')) }
            }
        }
    }
}

@Composable
fun NativeCompanyScreen(me: MeDto, back: () -> Unit) {
    Page("ORGANIZATION", "Company", "The organization linked to your account", action = {
        OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack, "Back", back)
    }) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                OrbitGlassCard(Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.Business, null, tint = OrbitViolet)
                    Text(me.company.name, style = MaterialTheme.typography.titleLarge)
                    Text(me.company.email, color = OrbitMuted)
                    Text("Company ID", style = MaterialTheme.typography.labelSmall, color = OrbitMuted)
                    SelectionContainer { Text(me.company.id, style = MaterialTheme.typography.bodySmall) }
                }
            }
            item {
                OrbitGlassCard(Modifier.fillMaxWidth()) {
                    Text("Access", fontWeight = FontWeight.Bold)
                    Text("Your mobile tools are selected from server-issued permissions. Hidden administration features are not accessible from this account.", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                    Text("${me.user.permissions.size} permission grants active", color = OrbitMint, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
fun NativeSecurityScreen(
    back: () -> Unit,
    signedOut: () -> Unit,
    vm: SecurityViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    var tab by remember { mutableStateOf("MFA") }
    var code by remember { mutableStateOf("") }
    val workspace = state.data
    LaunchedEffect(workspace?.reauthenticationRequired) {
        if (workspace?.reauthenticationRequired == true) signedOut()
    }
    Page("SECURITY", "Security center", "MFA, active devices and login history", action = {
        Row {
            OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack, "Back", back)
            OrbitIconButton(Icons.Outlined.Refresh, "Refresh", vm::refresh)
        }
    }) {
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            listOf("MFA", "SESSIONS", "HISTORY").forEach { value ->
                FilterChip(selected = tab == value, onClick = { tab = value }, label = { Text(value) })
            }
        }
        Spacer(Modifier.height(10.dp))
        StateBody(state, vm::refresh) { data ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
                state.error?.let { item { Text(it, color = OrbitRose, style = MaterialTheme.typography.bodySmall) } }
                when (tab) {
                    "MFA" -> {
                        item {
                            OrbitGlassCard(Modifier.fillMaxWidth()) {
                                Icon(if (data.mfa.enabled) Icons.Outlined.CheckCircle else Icons.Outlined.Key, null, tint = if (data.mfa.enabled) OrbitMint else OrbitViolet)
                                Text("Authenticator MFA", style = MaterialTheme.typography.titleMedium)
                                Text(if (data.mfa.enabled) "Enabled" else "Not enabled", color = if (data.mfa.enabled) OrbitMint else OrbitMuted)
                                if (!data.mfa.enabled && data.setup == null) Button(onClick = vm::beginSetup) { Text("Begin setup") }
                            }
                        }
                        data.setup?.let { setup ->
                            item {
                                OrbitGlassCard(Modifier.fillMaxWidth()) {
                                    Text("Add OrbitHR to your authenticator", fontWeight = FontWeight.Bold)
                                    Text("Copy this setup key into Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                                    SelectionContainer { Text(setup.secret, color = OrbitViolet, fontWeight = FontWeight.Bold) }
                                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(), label = { Text("6-digit code") }, singleLine = true)
                                    Button(onClick = { vm.confirm(code) }, enabled = code.length == 6) { Text("Verify and enable") }
                                }
                            }
                        }
                        if (data.mfa.enabled) item {
                            OrbitGlassCard(Modifier.fillMaxWidth()) {
                                Text("Disable MFA", fontWeight = FontWeight.Bold)
                                Text("Enter a current authenticator code. Disabling MFA signs out every active session.", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                                OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(), label = { Text("6-digit code") }, singleLine = true)
                                OutlinedButton(onClick = { vm.disable(code) }, enabled = code.length == 6) { Text("Disable MFA", color = OrbitRose) }
                            }
                        }
                    }
                    "SESSIONS" -> items(data.sessions, key = { it.id }) { session ->
                        OrbitGlassCard(Modifier.fillMaxWidth()) {
                            Icon(Icons.Outlined.Computer, null, tint = OrbitCyan)
                            Text(session.deviceName ?: "Unknown device", fontWeight = FontWeight.Bold)
                            Text(session.ipAddress ?: "IP unavailable", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                            Text("Last used ${session.lastUsedAt?.take(16) ?: session.createdAt.take(16)}", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                            OutlinedButton(onClick = { vm.revoke(session.id) }) { Text("Revoke session") }
                        }
                    }
                    else -> items(data.history, key = { it.id }) { entry ->
                        OrbitGlassCard(Modifier.fillMaxWidth()) {
                            Icon(Icons.Outlined.History, null, tint = if (entry.success) OrbitMint else OrbitRose)
                            Text(if (entry.success) "Successful sign-in" else "Sign-in failed", fontWeight = FontWeight.Bold)
                            Text(entry.email, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${entry.ipAddress} - ${entry.createdAt.take(16)}", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                            entry.reason?.let { Text(it.replace('_', ' '), color = OrbitRose, style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailCard(label: String, value: String) {
    OrbitGlassCard(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = OrbitMuted)
        Text(value, fontWeight = FontWeight.Bold)
    }
}
