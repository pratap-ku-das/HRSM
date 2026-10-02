package com.orbithr.app.ui

import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.orbithr.app.core.model.MyAssetDto

@Composable
fun MyAssetsScreen(
  onBack: () -> Unit,
  viewModel: MyAssetsViewModel = hiltViewModel()
) {
  val context = LocalContext.current
  val state by viewModel.state.collectAsState()
  val actionMessage by viewModel.actionMessage.collectAsState()

  var acknowledgingAsset by remember { mutableStateOf<MyAssetDto?>(null) }
  var returningAsset by remember { mutableStateOf<MyAssetDto?>(null) }
  var reportingAsset by remember { mutableStateOf<MyAssetDto?>(null) }

  LaunchedEffect(actionMessage) {
    actionMessage?.let {
      Toast.makeText(context, it, Toast.LENGTH_LONG).show()
      viewModel.clearActionMessage()
    }
  }

  Scaffold(
    topBar = {
      OrbitTopBar(
        title = "My Assigned Assets",
        onBack = onBack,
        actions = {
          IconButton(onClick = viewModel::refresh) {
            Icon(Icons.Outlined.Refresh, contentDescription = "Refresh Assets", tint = Color.White)
          }
        }
      )
    },
    containerColor = OrbitBackground
  ) { padding ->
    Box(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
    ) {
      StateBody(state, retry = viewModel::refresh) { assets ->
        if (assets.isEmpty()) {
          EmptyState(
            icon = Icons.Outlined.Devices,
            title = "No assets assigned",
            body = "You currently do not have any company hardware or equipment checked out."
          )
        } else {
          LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize()
          ) {
            item {
              Surface(
                shape = RoundedCornerShape(20.dp),
                color = OrbitDarkSurface,
                modifier = Modifier.fillMaxWidth()
              ) {
                Row(
                  modifier = Modifier.padding(16.dp),
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                  Icon(Icons.Outlined.Shield, contentDescription = null, tint = OrbitCyan, modifier = Modifier.size(28.dp))
                  Column {
                    Text("Company Equipment Policy", fontWeight = FontWeight.Bold, color = Color.White, style = MaterialTheme.typography.titleSmall)
                    Text("Please inspect all assigned hardware, confirm acknowledgement, and report any damages promptly.", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                  }
                }
              }
            }

            items(assets, key = { it.id }) { asset ->
              AssetCard(
                asset = asset,
                onAcknowledge = { acknowledgingAsset = asset },
                onRequestReturn = { returningAsset = asset },
                onReportIssue = { reportingAsset = asset }
              )
            }
          }
        }
      }

      // Dialog: Acknowledge Asset Receipt
      acknowledgingAsset?.let { asset ->
        var notes by remember { mutableStateOf("") }
        val deviceInfo = remember { "${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE})" }

        AlertDialog(
          onDismissRequest = { acknowledgingAsset = null },
          containerColor = OrbitDarkSurface,
          titleContentColor = Color.White,
          textContentColor = OrbitMuted,
          icon = { Icon(Icons.Outlined.TaskAlt, contentDescription = null, tint = OrbitMint) },
          title = { Text("Acknowledge Asset Receipt") },
          text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
              Text("I confirm receipt of ${asset.name} (SN: ${asset.serialNumber}) in ${asset.condition} condition.")
              OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Optional remarks / initial condition") },
                placeholder = { Text("e.g. Sealed box with accessories verified") },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = OrbitCyan,
                  unfocusedBorderColor = Color(0xFF333A50),
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White
                )
              )
              Text("Device audit stamp: $deviceInfo", style = MaterialTheme.typography.labelSmall, color = OrbitMuted)
            }
          },
          confirmButton = {
            Button(
              onClick = {
                viewModel.acknowledge(asset.id, notes.trim().ifEmpty { null }, deviceInfo)
                acknowledgingAsset = null
              },
              colors = ButtonDefaults.buttonColors(containerColor = OrbitMint, contentColor = OrbitDarkSurface)
            ) {
              Text("Confirm Receipt", fontWeight = FontWeight.Bold)
            }
          },
          dismissButton = {
            TextButton(onClick = { acknowledgingAsset = null }) {
              Text("Cancel", color = OrbitMuted)
            }
          }
        )
      }

      // Dialog: Request Asset Return
      returningAsset?.let { asset ->
        var reason by remember { mutableStateOf("") }
        var condition by remember { mutableStateOf(asset.condition) }

        AlertDialog(
          onDismissRequest = { returningAsset = null },
          containerColor = OrbitDarkSurface,
          titleContentColor = Color.White,
          textContentColor = OrbitMuted,
          icon = { Icon(Icons.Outlined.AssignmentReturn, contentDescription = null, tint = OrbitAmber) },
          title = { Text("Request Asset Return") },
          text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
              Text("Submit return request for ${asset.name} (SN: ${asset.serialNumber}) to IT and Operations.")
              OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text("Reason for Return *") },
                placeholder = { Text("e.g. Project completion / Hardware upgrade") },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = OrbitAmber,
                  unfocusedBorderColor = Color(0xFF333A50),
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White
                )
              )
              OutlinedTextField(
                value = condition,
                onValueChange = { condition = it },
                label = { Text("Hand-back Condition") },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = OrbitAmber,
                  unfocusedBorderColor = Color(0xFF333A50),
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White
                )
              )
            }
          },
          confirmButton = {
            Button(
              onClick = {
                if (reason.trim().length >= 3) {
                  viewModel.requestReturn(asset.id, reason.trim(), condition.trim())
                  returningAsset = null
                } else {
                  Toast.makeText(context, "Please enter a return reason", Toast.LENGTH_SHORT).show()
                }
              },
              colors = ButtonDefaults.buttonColors(containerColor = OrbitAmber, contentColor = OrbitDarkSurface)
            ) {
              Text("Submit Return", fontWeight = FontWeight.Bold)
            }
          },
          dismissButton = {
            TextButton(onClick = { returningAsset = null }) {
              Text("Cancel", color = OrbitMuted)
            }
          }
        )
      }

      // Dialog: Report Issue / Damage
      reportingAsset?.let { asset ->
        var description by remember { mutableStateOf("") }
        var severity by remember { mutableStateOf("MEDIUM") }

        AlertDialog(
          onDismissRequest = { reportingAsset = null },
          containerColor = OrbitDarkSurface,
          titleContentColor = Color.White,
          textContentColor = OrbitMuted,
          icon = { Icon(Icons.Outlined.ReportProblem, contentDescription = null, tint = OrbitRose) },
          title = { Text("Report Issue or Damage") },
          text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
              Text("Report a hardware malfunction, physical damage, or defect for ${asset.name}.")
              OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Issue Description *") },
                placeholder = { Text("Detailed explanation of defect or damage...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = OrbitRose,
                  unfocusedBorderColor = Color(0xFF333A50),
                  focusedTextColor = Color.White,
                  unfocusedTextColor = Color.White
                )
              )
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("LOW", "MEDIUM", "HIGH", "CRITICAL").forEach { level ->
                  FilterChip(
                    selected = severity == level,
                    onClick = { severity = level },
                    label = { Text(level, style = MaterialTheme.typography.labelSmall) },
                    colors = FilterChipDefaults.filterChipColors(
                      selectedContainerColor = if (level == "CRITICAL") OrbitRose else OrbitCyan,
                      selectedLabelColor = Color.White
                    )
                  )
                }
              }
            }
          },
          confirmButton = {
            Button(
              onClick = {
                if (description.trim().length >= 5) {
                  viewModel.reportIssue(asset.id, description.trim(), severity)
                  reportingAsset = null
                } else {
                  Toast.makeText(context, "Please describe the issue in detail", Toast.LENGTH_SHORT).show()
                }
              },
              colors = ButtonDefaults.buttonColors(containerColor = OrbitRose, contentColor = Color.White)
            ) {
              Text("Submit Report", fontWeight = FontWeight.Bold)
            }
          },
          dismissButton = {
            TextButton(onClick = { reportingAsset = null }) {
              Text("Cancel", color = OrbitMuted)
            }
          }
        )
      }
    }
  }
}

@Composable
private fun AssetCard(
  asset: MyAssetDto,
  onAcknowledge: () -> Unit,
  onRequestReturn: () -> Unit,
  onReportIssue: () -> Unit
) {
  val icon = when (asset.category.uppercase()) {
    "LAPTOP", "COMPUTER" -> Icons.Outlined.LaptopMac
    "PHONE", "MOBILE" -> Icons.Outlined.Smartphone
    "MONITOR", "DISPLAY" -> Icons.Outlined.DesktopWindows
    "ACCESSORY", "HEADPHONES" -> Icons.Outlined.Headphones
    else -> Icons.Outlined.Devices
  }

  Surface(
    shape = RoundedCornerShape(24.dp),
    color = OrbitDarkSurface,
    modifier = Modifier.fillMaxWidth()
  ) {
    Column(
      modifier = Modifier.padding(18.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
      // Header: Icon + Name + Category + Status Badge
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
      ) {
        Box(
          modifier = Modifier
            .size(46.dp)
            .background(OrbitCyan.copy(alpha = 0.15f), RoundedCornerShape(14.dp)),
          contentAlignment = Alignment.Center
        ) {
          Icon(icon, contentDescription = null, tint = OrbitCyan, modifier = Modifier.size(24.dp))
        }

        Column(modifier = Modifier.weight(1f)) {
          Text(asset.name, fontWeight = FontWeight.Bold, color = Color.White, style = MaterialTheme.typography.titleMedium)
          Text("${asset.category} · Condition: ${asset.condition}", color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
        }

        OrbitStatusBadge(asset.status, orbitStatusColor(asset.status))
      }

      HorizontalDivider(color = Color(0xFF282F45))

      // Asset Details Grid
      Row(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.weight(1f)) {
          Text("SERIAL NUMBER", style = MaterialTheme.typography.labelSmall, color = OrbitMuted)
          Text(asset.serialNumber, fontWeight = FontWeight.SemiBold, color = Color.White, style = MaterialTheme.typography.bodySmall)
        }
        Column(modifier = Modifier.weight(1f)) {
          Text("ASSIGNED DATE", style = MaterialTheme.typography.labelSmall, color = OrbitMuted)
          Text(asset.assignedDate?.take(10) ?: "Not recorded", fontWeight = FontWeight.SemiBold, color = Color.White, style = MaterialTheme.typography.bodySmall)
        }
      }

      // Acknowledgement & Return Indicators
      if (asset.isAcknowledged) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          modifier = Modifier
            .background(OrbitMint.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp)
        ) {
          Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = OrbitMint, modifier = Modifier.size(16.dp))
          Text("Receipt Acknowledged${asset.acknowledgedAt?.let { " (${it.take(10)})" } ?: ""}", style = MaterialTheme.typography.labelSmall, color = OrbitMint, fontWeight = FontWeight.Bold)
        }
      } else {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp),
          modifier = Modifier
            .background(OrbitAmber.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp)
        ) {
          Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = OrbitAmber, modifier = Modifier.size(16.dp))
          Text("Acknowledgement Required", style = MaterialTheme.typography.labelSmall, color = OrbitAmber, fontWeight = FontWeight.Bold)
        }
      }

      if (asset.hasPendingReturn) {
        Text("Return request is pending approval by Operations team.", color = OrbitAmber, style = MaterialTheme.typography.labelSmall)
      }

      // Action Buttons
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        if (!asset.isAcknowledged) {
          Button(
            onClick = onAcknowledge,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.buttonColors(containerColor = OrbitMint, contentColor = OrbitDarkSurface),
            shape = RoundedCornerShape(12.dp)
          ) {
            Icon(Icons.Outlined.TaskAlt, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("Acknowledge", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
          }
        }

        OutlinedButton(
          onClick = onReportIssue,
          modifier = Modifier.weight(1f),
          colors = ButtonDefaults.outlinedButtonColors(contentColor = OrbitRose),
          border = androidx.compose.foundation.BorderStroke(1.dp, OrbitRose.copy(alpha = 0.5f)),
          shape = RoundedCornerShape(12.dp)
        ) {
          Icon(Icons.Outlined.BugReport, contentDescription = null, modifier = Modifier.size(16.dp))
          Spacer(Modifier.width(6.dp))
          Text("Report Issue", style = MaterialTheme.typography.labelMedium)
        }

        if (!asset.hasPendingReturn) {
          OutlinedButton(
            onClick = onRequestReturn,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF3B4460)),
            shape = RoundedCornerShape(12.dp)
          ) {
            Icon(Icons.Outlined.AssignmentReturn, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("Return", style = MaterialTheme.typography.labelMedium)
          }
        }
      }
    }
  }
}
