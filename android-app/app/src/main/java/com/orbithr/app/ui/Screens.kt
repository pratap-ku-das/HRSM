package com.orbithr.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.automirrored.outlined.EventNote
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.orbithr.app.core.model.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlinx.coroutines.delay

private val attendanceTimeFormat = DateTimeFormatter.ofPattern("hh:mm a", Locale.ENGLISH)

private fun String?.asLocalAttendanceTime(): String {
    if (this.isNullOrBlank()) return "--:--"
    return runCatching { Instant.parse(this).atZone(ZoneId.systemDefault()).format(attendanceTimeFormat) }
        .getOrElse { substringAfter('T').take(5) }
}

private fun String.prettyDate(): String = runCatching {
    LocalDate.parse(substringBefore('T')).format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))
}.getOrDefault(substringBefore('T'))

private fun AttendanceDto.workedTime(): String {
    if (clockInTime.isNullOrBlank()) return "No punch"
    return runCatching {
        val start = Instant.parse(clockInTime)
        val end = clockOutTime?.let(Instant::parse) ?: Instant.now()
        val totalMinutes = java.time.Duration.between(start, end).toMinutes().coerceAtLeast(0)
        "${totalMinutes / 60}h ${totalMinutes % 60}m${if (clockOutTime == null) " live" else ""}"
    }.getOrDefault("Recorded")
}

@Composable
private fun OrbitListItem(
    headline: @Composable () -> Unit,
    supporting: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth().then(if (onClick != null && enabled) Modifier.clickable(onClick = onClick) else Modifier),
        shape = RoundedCornerShape(20.dp),
        color = if (enabled) Color.White else Color(0xFFF1F2F7),
        border = BorderStroke(1.dp, if (enabled) Color(0xFFE9EAF2) else Color(0xFFE4E5EB)),
    ) {
        ListItem(
            headlineContent = headline,
            supportingContent = supporting,
            leadingContent = leading,
            trailingContent = trailing,
            colors = ListItemDefaults.colors(
                containerColor = Color.Transparent,
                headlineColor = OrbitInk.copy(alpha = if (enabled) 1f else .45f),
                supportingColor = OrbitMuted.copy(alpha = if (enabled) 1f else .5f),
            ),
        )
    }
}

@Composable
private fun Page(
    eyebrow: String,
    title: String,
    subtitle: String? = null,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = 18.dp)) {
        OrbitPageHeader(eyebrow, title, subtitle, action)
        content()
    }
}

@Composable
private fun <T> StateBody(state: LoadState<T>, retry: () -> Unit, body: @Composable (T) -> Unit) {
    when {
        state.loading && state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(color = OrbitViolet, strokeWidth = 3.dp, modifier = Modifier.size(34.dp))
                Text("Syncing your workspace", style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
            }
        }
        state.error != null && state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            OrbitGlassCard(Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.CloudOff, null, tint = OrbitRose, modifier = Modifier.size(30.dp))
                Spacer(Modifier.height(10.dp))
                Text("We couldn't sync this page", style = MaterialTheme.typography.titleLarge)
                Text(state.error, color = OrbitMuted, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(14.dp))
                Button(onClick = retry, shape = RoundedCornerShape(14.dp)) { Icon(Icons.Outlined.Refresh, null); Spacer(Modifier.width(7.dp)); Text("Try again") }
            }
        }
        state.data != null -> body(state.data)
    }
}

@Composable
private fun MetricCard(label: String, value: String, icon: ImageVector, color: Color, modifier: Modifier = Modifier) {
    Surface(modifier, shape = RoundedCornerShape(22.dp), color = Color.White, border = BorderStroke(1.dp, Color(0xFFE9EAF3)), shadowElevation = 2.dp) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(34.dp).background(color.copy(alpha = .11f), RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = color, modifier = Modifier.size(18.dp))
            }
            Text(value, style = MaterialTheme.typography.headlineSmall, color = OrbitInk)
            Text(label, style = MaterialTheme.typography.bodySmall, color = OrbitMuted, maxLines = 1)
        }
    }
}

@Composable
fun HomeScreen(
    me: MeDto,
    attendance: () -> Unit,
    leave: () -> Unit,
    pay: () -> Unit,
    vm: HomeViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val firstName = me.user.fullName.substringBefore(' ')
    Page("YOUR WORKSPACE", "Good ${greeting()}, $firstName", me.employee?.designation?.title ?: me.company.name, action = {
        Surface(shape = CircleShape, color = OrbitViolet, shadowElevation = 6.dp) {
            Box(Modifier.size(46.dp), contentAlignment = Alignment.Center) {
                Text(me.user.fullName.split(' ').mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString(""), color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    }) {
        StateBody(state, vm::refresh) { dashboard ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(15.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
                item {
                    Surface(shape = RoundedCornerShape(28.dp), color = Color.Transparent, modifier = Modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(28.dp), spotColor = Color(0x443E36C8))) {
                        Box(Modifier.background(OrbitHeroBrush).padding(22.dp)) {
                            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = .13f)) {
                                        Row(Modifier.padding(horizontal = 11.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Box(Modifier.size(7.dp).background(OrbitMint, CircleShape))
                                            Text("Workspace live", color = Color.White, style = MaterialTheme.typography.labelMedium)
                                        }
                                    }
                                    Spacer(Modifier.weight(1f))
                                    OrbitLogo(compact = true, light = true)
                                }
                                Text("Everything you need\nfor a brilliant workday.", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.CalendarToday, null, tint = OrbitCyan, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(7.dp))
                                    Text(LocalDate.now().format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)), color = Color.White.copy(alpha = .72f), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
                item {
                    OrbitSectionTitle("Today at a glance", "Live company pulse", trailing = { IconButton(onClick = vm::refresh) { Icon(Icons.Outlined.Refresh, "Refresh", tint = OrbitViolet) } })
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                        MetricCard("Present today", dashboard.presentToday.toString(), Icons.Outlined.HowToReg, OrbitMint, Modifier.weight(1f))
                        MetricCard("Active people", dashboard.activeEmployees.toString(), Icons.Outlined.Groups, OrbitCyan, Modifier.weight(1f))
                        MetricCard("Leave queue", dashboard.pendingLeaves.toString(), Icons.Outlined.EventBusy, OrbitAmber, Modifier.weight(1f))
                    }
                }
                item { OrbitSectionTitle("Quick actions", "Move through your day") }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        QuickAction(Icons.Outlined.Face, "Verify & punch", OrbitViolet, attendance, Modifier.weight(1f))
                        QuickAction(Icons.Outlined.BeachAccess, "Request leave", OrbitMint, leave, Modifier.weight(1f))
                        QuickAction(Icons.AutoMirrored.Outlined.ReceiptLong, "View payslip", OrbitRose, pay, Modifier.weight(1f))
                    }
                }
                if (dashboard.announcements.isNotEmpty()) item { OrbitSectionTitle("Company feed", "What everyone should know") }
                items(dashboard.announcements, key = { it.id }) { announcement ->
                    OrbitGlassCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(40.dp).background(OrbitViolet.copy(alpha = .1f), RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Outlined.Campaign, null, tint = OrbitViolet)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(announcement.title, style = MaterialTheme.typography.titleMedium, color = OrbitInk)
                                Spacer(Modifier.height(4.dp))
                                Text(announcement.content, maxLines = 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
                            }
                            OrbitStatusBadge(announcement.priority, if (announcement.priority == "HIGH") OrbitRose else OrbitCyan)
                        }
                    }
                }
                if (dashboard.holidays.isNotEmpty()) item { OrbitSectionTitle("Moments ahead", "Upcoming holidays") }
                items(dashboard.holidays, key = { it.id }) { holiday ->
                    OrbitListItem(
                        headline = { Text(holiday.name, fontWeight = FontWeight.Bold) },
                        supporting = { Text(holiday.date.prettyDate()) },
                        leading = { Box(Modifier.size(42.dp).background(OrbitAmber.copy(alpha = .12f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Celebration, null, tint = OrbitAmber) } },
                        trailing = { Icon(Icons.AutoMirrored.Outlined.ArrowForwardIos, null, tint = OrbitMuted, modifier = Modifier.size(14.dp)) },
                    )
                }
            }
        }
    }
}

private fun greeting(): String = when (java.time.LocalTime.now().hour) {
    in 5..11 -> "morning"
    in 12..16 -> "afternoon"
    else -> "evening"
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, color: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(onClick = onClick, modifier = modifier, shape = RoundedCornerShape(20.dp), color = color.copy(alpha = .09f), border = BorderStroke(1.dp, color.copy(alpha = .15f))) {
        Column(Modifier.padding(horizontal = 11.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.size(23.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, color = OrbitInk, maxLines = 2)
        }
    }
}

@Composable
fun AttendanceScreen(verifyAttendance: (String, (AttendanceVerificationResult) -> Unit) -> Unit, vm: AttendanceViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var confirmation by remember { mutableStateOf<String?>(null) }
    var proof by remember { mutableStateOf<AttendanceVerificationProof?>(null) }
    var verificationInProgress by remember { mutableStateOf(false) }
    var verificationMessage by remember { mutableStateOf("Your HR-approved face and precise location are required for every punch.") }
    val verificationColor by animateColorAsState(if (proof != null) OrbitMint else OrbitViolet, label = "verificationColor")
    val today = LocalDate.now().toString()
    val todayRecord = state.data.orEmpty().firstOrNull { it.date.take(10) == today }
    val hasClockedIn = todayRecord?.clockInTime != null
    val hasClockedOut = todayRecord?.clockOutTime != null
    val canClockIn = !state.loading && !hasClockedIn
    val canClockOut = !state.loading && hasClockedIn && !hasClockedOut
    val canVerify = canClockIn || canClockOut
    val nextAction = if (canClockOut) "CLOCK_OUT" else "CLOCK_IN"

    LaunchedEffect(proof?.verifiedAtMillis) {
        if (proof != null) {
            delay(60_000)
            proof = null
            verificationMessage = "Verification expired. Match your face again before attendance."
        }
    }

    Page("SECURE ATTENDANCE", "Your time, verified", "Face + GPS protected", action = { OrbitIconButton(Icons.Outlined.Refresh, "Refresh", vm::refresh) }) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
            state.error?.let { message -> item {
                Surface(shape = RoundedCornerShape(16.dp), color = OrbitRose.copy(alpha = .1f)) {
                    Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Icon(Icons.Outlined.ErrorOutline, null, tint = OrbitRose)
                        Text(message, style = MaterialTheme.typography.bodySmall, color = Color(0xFFB93259))
                    }
                }
            } }
            item {
                Surface(shape = RoundedCornerShape(30.dp), color = Color.Transparent, modifier = Modifier.fillMaxWidth().shadow(12.dp, RoundedCornerShape(30.dp), spotColor = verificationColor.copy(alpha = .35f))) {
                    Box(Modifier.background(if (proof != null) Brush.linearGradient(listOf(Color(0xFF075D4A), OrbitMint)) else OrbitHeroBrush).padding(21.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(76.dp).background(Color.White.copy(alpha = .12f), CircleShape), contentAlignment = Alignment.Center) {
                                    Box(Modifier.size(60.dp).background(Color.White.copy(alpha = .10f), CircleShape), contentAlignment = Alignment.Center) {
                                        Icon(if (proof != null) Icons.Outlined.VerifiedUser else Icons.Outlined.Face, null, tint = Color.White, modifier = Modifier.size(32.dp))
                                    }
                                }
                                Spacer(Modifier.width(16.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(if (proof != null) "Identity verified" else "Ready to verify", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                                    Text(verificationMessage, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = .72f))
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                VerifyStep(Icons.Outlined.Face, "Live face", proof != null, Modifier.weight(1f))
                                VerifyStep(Icons.Outlined.VerifiedUser, "Employee match", proof != null, Modifier.weight(1f))
                                VerifyStep(Icons.Outlined.MyLocation, "Precise GPS", proof != null, Modifier.weight(1f))
                            }
                            AnimatedVisibility(proof != null) {
                                val verified = proof
                                if (verified != null) Text("GPS ${"%.5f".format(verified.latitude)}, ${"%.5f".format(verified.longitude)} · ±${verified.accuracyMeters.toInt()}m", color = Color.White.copy(alpha = .72f), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            item {
                Button(
                    onClick = {
                        verificationInProgress = true
                        verificationMessage = "Opening secure face and location verification…"
                        verifyAttendance(nextAction) { result ->
                            verificationInProgress = false
                            when (result) {
                                is AttendanceVerificationResult.Verified -> { proof = result.proof; verificationMessage = "Employee face matched. ${if (result.proof.action == "CLOCK_IN") "Clock-in" else "Clock-out"} is unlocked for 60 seconds." }
                                is AttendanceVerificationResult.Failed -> { proof = null; verificationMessage = result.message }
                            }
                        }
                    },
                    enabled = !verificationInProgress && canVerify,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = verificationColor),
                ) {
                    if (verificationInProgress) CircularProgressIndicator(Modifier.size(19.dp), color = Color.White, strokeWidth = 2.dp) else Icon(Icons.Outlined.CenterFocusStrong, null)
                    Spacer(Modifier.width(9.dp))
                    Text(if (hasClockedOut) "Attendance completed for today" else if (verificationInProgress) "Matching employee face securely…" else if (proof != null) "Verified — ready to ${if (nextAction == "CLOCK_IN") "clock in" else "clock out"}" else "Verify face & location for ${if (nextAction == "CLOCK_IN") "clock-in" else "clock-out"}")
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    Button(onClick = { confirmation = "CLOCK_IN" }, enabled = proof?.action == "CLOCK_IN" && canClockIn, modifier = Modifier.weight(1f).height(54.dp), shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(containerColor = OrbitInk)) {
                        Icon(Icons.AutoMirrored.Outlined.Login, null); Spacer(Modifier.width(7.dp)); Text(if (hasClockedIn) "Clocked in" else "Clock in")
                    }
                    OutlinedButton(onClick = { confirmation = "CLOCK_OUT" }, enabled = proof?.action == "CLOCK_OUT" && canClockOut, modifier = Modifier.weight(1f).height(54.dp), shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, OrbitInk)) {
                        Icon(Icons.AutoMirrored.Outlined.Logout, null); Spacer(Modifier.width(7.dp)); Text(if (hasClockedOut) "Clocked out" else "Clock out")
                    }
                }
            }
            item { OrbitSectionTitle("Your timeline", "Server-recorded attendance history") }
            when {
                state.loading && state.data == null -> item { Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = OrbitViolet) } }
                state.data.isNullOrEmpty() -> item { EmptyState(Icons.Outlined.Schedule, "No attendance yet", "Your first verified punch will appear here.") }
                else -> items(state.data.orEmpty(), key = { it.id }) { record -> AttendanceHistoryCard(record) }
            }
        }
    }

    confirmation?.let { action ->
        AlertDialog(
            onDismissRequest = { confirmation = null },
            shape = RoundedCornerShape(28.dp),
            icon = { Icon(if (action == "CLOCK_IN") Icons.AutoMirrored.Outlined.Login else Icons.AutoMirrored.Outlined.Logout, null, tint = OrbitViolet) },
            title = { Text(if (action == "CLOCK_IN") "Start your workday?" else "Finish your workday?") },
            text = { Text("OrbitHR will consume this one-time employee face match and record GPS plus authoritative server time.") },
            confirmButton = {
                Button(onClick = {
                    val verifiedProof = proof
                    confirmation = null
                    if (verifiedProof?.action == action && ((action == "CLOCK_IN" && canClockIn) || (action == "CLOCK_OUT" && canClockOut))) {
                        proof = null
                        verificationMessage = "Your HR-approved face and precise location are required for every punch."
                        vm.punch(action, verifiedProof)
                    }
                }, enabled = proof?.action == action && if (action == "CLOCK_IN") canClockIn else canClockOut) { Text("Confirm") }
            },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Not now") } },
        )
    }
}

@Composable
private fun RowScope.VerifyStep(icon: ImageVector, label: String, verified: Boolean, modifier: Modifier = Modifier) {
    Surface(modifier, shape = RoundedCornerShape(15.dp), color = Color.White.copy(alpha = .1f)) {
        Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(if (verified) Icons.Outlined.CheckCircle else icon, null, tint = if (verified) Color.White else OrbitCyan, modifier = Modifier.size(18.dp))
            Text(label, color = Color.White, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}

@Composable
private fun AttendanceHistoryCard(record: AttendanceDto) {
    OrbitGlassCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).background(orbitStatusColor(record.status).copy(alpha = .1f), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.Schedule, null, tint = orbitStatusColor(record.status))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(record.date.prettyDate(), style = MaterialTheme.typography.titleMedium, color = OrbitInk)
                Text("${record.clockInTime.asLocalAttendanceTime()}  →  ${record.clockOutTime.asLocalAttendanceTime()}", style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                OrbitStatusBadge(record.status, orbitStatusColor(record.status))
                Text(record.workedTime(), style = MaterialTheme.typography.labelMedium, color = OrbitInk)
            }
        }
        if (record.faceAuthVerified) {
            Spacer(Modifier.height(11.dp)); HorizontalDivider(color = Color(0xFFEEEFF5)); Spacer(Modifier.height(9.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.VerifiedUser, null, tint = OrbitMint, modifier = Modifier.size(15.dp)); Spacer(Modifier.width(6.dp))
                Text("Face + location verified", style = MaterialTheme.typography.bodySmall, color = OrbitMint)
                Spacer(Modifier.weight(1f)); Text(record.source.replace('_', ' '), style = MaterialTheme.typography.labelMedium, color = OrbitMuted)
            }
        }
    }
}

@Composable
fun LeaveScreen(vm: LeaveViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var showForm by remember { mutableStateOf(false) }
    Page("TIME AWAY", "Leave, without the wait", "Plan time off with clarity", action = { OrbitIconButton(Icons.Outlined.Add, "Apply for leave") { showForm = true } }) {
        StateBody(state, vm::refresh) { data ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
                item {
                    Surface(shape = RoundedCornerShape(28.dp), color = Color.Transparent, modifier = Modifier.fillMaxWidth()) {
                        Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFF08755B), OrbitMint))).padding(21.dp)) {
                            Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.WbSunny, null, tint = OrbitAmber, modifier = Modifier.size(28.dp)); Spacer(Modifier.weight(1f)); OrbitStatusBadge("${data.requests.count { it.status == "PENDING" }} pending", Color.White)
                                }
                                Text("Rest is part of\ngreat work.", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                                Text("Explore your leave policies and track every request in one place.", color = Color.White.copy(alpha = .72f), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                item { OrbitSectionTitle("Your policies", "Annual allowance") }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(end = 4.dp)) {
                        items(data.types, key = { it.id }) { type ->
                            Surface(shape = RoundedCornerShape(20.dp), color = Color.White, border = BorderStroke(1.dp, Color(0xFFE9EAF2)), modifier = Modifier.width(150.dp)) {
                                Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                    Icon(if (type.isPaid) Icons.Outlined.Paid else Icons.AutoMirrored.Outlined.EventNote, null, tint = if (type.isPaid) OrbitMint else OrbitViolet)
                                    Text(type.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${type.daysAllowedPerYear} days / year", style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
                                }
                            }
                        }
                    }
                }
                item { OrbitSectionTitle("My requests", "Latest status updates") }
                if (data.requests.isEmpty()) item { EmptyState(Icons.Outlined.BeachAccess, "No leave requests", "When you need time away, begin here.") }
                items(data.requests, key = { it.id }) { request ->
                    OrbitListItem(
                        headline = { Text(request.leaveType?.name ?: "Leave", fontWeight = FontWeight.Bold) },
                        supporting = { Text("${request.startDate.prettyDate()} → ${request.endDate.prettyDate()} · ${request.totalDays.toInt()} day${if (request.totalDays == 1.0) "" else "s"}") },
                        leading = { Box(Modifier.size(42.dp).background(orbitStatusColor(request.status).copy(alpha = .1f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.EventAvailable, null, tint = orbitStatusColor(request.status)) } },
                        trailing = { OrbitStatusBadge(request.status, orbitStatusColor(request.status)) },
                    )
                }
            }
        }
    }
    if (showForm) LeaveDialog(state.data?.types.orEmpty(), { showForm = false }) { vm.apply(it); showForm = false }
}

@Composable
private fun LeaveDialog(types: List<LeaveTypeDto>, dismiss: () -> Unit, submit: (ApplyLeaveRequest) -> Unit) {
    var type by remember(types) { mutableStateOf(types.firstOrNull()?.id.orEmpty()) }
    var start by remember { mutableStateOf(LocalDate.now().toString()) }
    var end by remember { mutableStateOf(LocalDate.now().toString()) }
    var reason by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = dismiss, shape = RoundedCornerShape(28.dp), icon = { Icon(Icons.Outlined.BeachAccess, null, tint = OrbitMint) }, title = { Text("Plan your time away") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(types.firstOrNull { it.id == type }?.name ?: "No leave policies available", color = OrbitViolet, fontWeight = FontWeight.Bold)
            OutlinedTextField(start, { start = it }, label = { Text("Start date (YYYY-MM-DD)") }, shape = RoundedCornerShape(15.dp), singleLine = true)
            OutlinedTextField(end, { end = it }, label = { Text("End date (YYYY-MM-DD)") }, shape = RoundedCornerShape(15.dp), singleLine = true)
            OutlinedTextField(reason, { reason = it }, label = { Text("Reason") }, shape = RoundedCornerShape(15.dp), minLines = 2)
        }
    }, confirmButton = { Button(onClick = { submit(ApplyLeaveRequest(type, start, end, reason)) }, enabled = type.isNotBlank() && reason.length >= 3) { Text("Submit request") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}

@Composable
fun PayslipScreen(vm: PayViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    Page("COMPENSATION", "Pay, made transparent", "Your earnings and payslips") {
        StateBody(state, retry = {}) { payslips ->
            if (payslips.isEmpty()) EmptyState(Icons.Outlined.AccountBalanceWallet, "No published payslips", "Your payroll team has not published a payslip yet.")
            else LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
                item {
                    val latest = payslips.first()
                    Surface(shape = RoundedCornerShape(30.dp), color = Color.Transparent, modifier = Modifier.fillMaxWidth().shadow(12.dp, RoundedCornerShape(30.dp), spotColor = Color(0x443E36C8))) {
                        Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFF1D2145), OrbitIndigo, OrbitViolet))).padding(22.dp)) {
                            Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                                Row { Text("LATEST NET PAY", style = MaterialTheme.typography.labelMedium, color = OrbitCyan); Spacer(Modifier.weight(1f)); OrbitStatusBadge(latest.status, Color.White) }
                                Text("₹${"%,.0f".format(latest.netSalary)}", style = MaterialTheme.typography.displaySmall, color = Color.White)
                                Text(latest.month, style = MaterialTheme.typography.titleMedium, color = Color.White.copy(alpha = .75f))
                                HorizontalDivider(color = Color.White.copy(alpha = .14f))
                                Row {
                                    PayMetric("Gross", latest.grossSalary, Modifier.weight(1f))
                                    PayMetric("Deductions", latest.totalDeductions, Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
                item { OrbitSectionTitle("Payslip archive", "All published salary statements") }
                items(payslips, key = { it.id }) { payslip ->
                    OrbitListItem(
                        headline = { Text(payslip.month, fontWeight = FontWeight.Bold) },
                        supporting = { Text("Gross ₹${"%,.0f".format(payslip.grossSalary)} · Deductions ₹${"%,.0f".format(payslip.totalDeductions)}") },
                        leading = { Box(Modifier.size(42.dp).background(OrbitViolet.copy(alpha = .1f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Description, null, tint = OrbitViolet) } },
                        trailing = { Column(horizontalAlignment = Alignment.End) { Text("₹${"%,.0f".format(payslip.netSalary)}", fontWeight = FontWeight.Bold); Text(payslip.status, style = MaterialTheme.typography.labelMedium, color = orbitStatusColor(payslip.status)) } },
                    )
                }
            }
        }
    }
}

@Composable
private fun RowScope.PayMetric(label: String, value: Double, modifier: Modifier = Modifier) {
    Column(modifier) { Text(label, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = .58f)); Text("₹${"%,.0f".format(value)}", style = MaterialTheme.typography.titleMedium, color = Color.White) }
}

@Composable
fun ExpenseScreen(back: () -> Unit, vm: ExpenseViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var showForm by remember { mutableStateOf(false) }
    Page("REIMBURSEMENTS", "Expense claims", "Submit and track spending", action = { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack, "Back", back); OrbitIconButton(Icons.Outlined.Add, "Submit expense") { showForm = true } } }) {
        StateBody(state, vm::refresh) { expenses ->
            if (expenses.isEmpty()) EmptyState(Icons.AutoMirrored.Outlined.ReceiptLong, "No expense claims", "Your submitted business expenses will appear here.")
            else LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
                items(expenses, key = { it.id }) { expense -> OrbitListItem(
                    headline = { Text(expense.title, fontWeight = FontWeight.Bold) },
                    supporting = { Text("${expense.category.replace('_', ' ')} · ${expense.expenseDate.prettyDate()}") },
                    leading = { Box(Modifier.size(42.dp).background(OrbitAmber.copy(alpha = .1f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Receipt, null, tint = OrbitAmber) } },
                    trailing = { Column(horizontalAlignment = Alignment.End) { Text("₹${"%,.0f".format(expense.amount)}", fontWeight = FontWeight.Bold); OrbitStatusBadge(expense.status, orbitStatusColor(expense.status)) } },
                ) }
            }
        }
    }
    if (showForm) ExpenseDialog({ showForm = false }) { vm.submit(it); showForm = false }
}

@Composable
private fun ExpenseDialog(dismiss: () -> Unit, submit: (SubmitExpenseRequest) -> Unit) {
    var title by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = dismiss, shape = RoundedCornerShape(28.dp), icon = { Icon(Icons.AutoMirrored.Outlined.ReceiptLong, null, tint = OrbitAmber) }, title = { Text("New expense claim") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            OutlinedTextField(title, { title = it }, label = { Text("Title") }, shape = RoundedCornerShape(15.dp))
            OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Amount (INR)") }, shape = RoundedCornerShape(15.dp))
            OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, shape = RoundedCornerShape(15.dp), minLines = 2)
            Text("Receipt upload will be enabled when the authenticated file API is deployed.", style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
        }
    }, confirmButton = { Button(onClick = { submit(SubmitExpenseRequest(title, "MISC", amount.toDoubleOrNull() ?: 0.0, LocalDate.now().toString(), notes)) }, enabled = title.length >= 3 && (amount.toDoubleOrNull() ?: 0.0) > 0) { Text("Submit") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}

@Composable
fun MoreScreen(me: MeDto, logout: () -> Unit, expenses: () -> Unit, employees: () -> Unit) {
    Page("YOUR SPACE", "More from OrbitHR", "Profile, tools and settings") {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
            item {
                Surface(shape = RoundedCornerShape(28.dp), color = Color.Transparent, modifier = Modifier.fillMaxWidth()) {
                    Box(Modifier.background(OrbitHeroBrush).padding(20.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(60.dp).background(Color.White.copy(alpha = .15f), CircleShape), contentAlignment = Alignment.Center) {
                                Text(me.user.fullName.split(' ').mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString(""), color = Color.White, style = MaterialTheme.typography.titleLarge)
                            }
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) { Text(me.user.fullName, style = MaterialTheme.typography.titleLarge, color = Color.White); Text(me.user.email, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = .68f)); Spacer(Modifier.height(5.dp)); OrbitStatusBadge(me.user.role, OrbitCyan) }
                        }
                    }
                }
            }
            item { OrbitSectionTitle("Work tools", "Everything else in one place") }
            item { MoreAction(Icons.AutoMirrored.Outlined.ReceiptLong, "Expenses", "Submit and track claims", OrbitAmber, expenses) }
            if ("employee.read.all" in me.user.permissions) item { MoreAction(Icons.Outlined.Groups, "People directory", "Employees and onboarding", OrbitCyan, employees) }
            item { MoreAction(Icons.Outlined.FolderOpen, "Documents", "Secure file vault coming soon", OrbitViolet, {}, false) }
            item { MoreAction(Icons.Outlined.TrackChanges, "Goals & performance", "Performance workspace coming soon", OrbitRose, {}, false) }
            item { MoreAction(Icons.Outlined.NotificationsNone, "Notifications", "Push notifications coming soon", OrbitMint, {}, false) }
            item {
                OutlinedButton(onClick = logout, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, OrbitRose.copy(alpha = .35f)), colors = ButtonDefaults.outlinedButtonColors(contentColor = OrbitRose)) {
                    Icon(Icons.AutoMirrored.Outlined.Logout, null); Spacer(Modifier.width(8.dp)); Text("Sign out securely")
                }
            }
            item { Text("OrbitHR mobile · Secure employee workspace", Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center, style = MaterialTheme.typography.bodySmall, color = OrbitMuted) }
        }
    }
}

@Composable
private fun MoreAction(icon: ImageVector, title: String, subtitle: String, color: Color, onClick: () -> Unit, enabled: Boolean = true) {
    OrbitListItem(
        headline = { Text(title, fontWeight = FontWeight.Bold) },
        supporting = { Text(subtitle) },
        leading = { Box(Modifier.size(42.dp).background(color.copy(alpha = .1f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = color) } },
        trailing = { Icon(if (enabled) Icons.AutoMirrored.Outlined.ArrowForwardIos else Icons.Outlined.Lock, null, tint = OrbitMuted, modifier = Modifier.size(15.dp)) },
        enabled = enabled,
        onClick = onClick,
    )
}

@Composable
fun EmployeeScreen(back: () -> Unit, vm: EmployeeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var search by remember { mutableStateOf("") }
    var showOnboarding by remember { mutableStateOf(false) }
    Page("PEOPLE", "Employee directory", "Your connected workforce", action = { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OrbitIconButton(Icons.AutoMirrored.Outlined.ArrowBack, "Back", back); OrbitIconButton(Icons.Outlined.PersonAdd, "Onboard employee") { showOnboarding = true } } }) {
        OutlinedTextField(search, { search = it; vm.search(it.takeIf(String::isNotBlank)) }, Modifier.fillMaxWidth(), label = { Text("Search people") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, shape = RoundedCornerShape(17.dp), singleLine = true)
        Spacer(Modifier.height(12.dp))
        StateBody(state, { vm.search(search) }) { employees -> LazyColumn(verticalArrangement = Arrangement.spacedBy(9.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
            items(employees, key = { it.id }) { employee -> OrbitListItem(
                headline = { Text("${employee.firstName} ${employee.lastName}", fontWeight = FontWeight.Bold) },
                supporting = { Text("${employee.employeeCode} · ${employee.designation?.title ?: "No designation"}") },
                leading = { Box(Modifier.size(42.dp).background(OrbitViolet.copy(alpha = .1f), CircleShape), contentAlignment = Alignment.Center) { Text(employee.firstName.firstOrNull()?.toString().orEmpty() + employee.lastName.firstOrNull()?.toString().orEmpty(), color = OrbitViolet, fontWeight = FontWeight.Bold) } },
                trailing = { OrbitStatusBadge(employee.status, orbitStatusColor(employee.status)) },
            ) }
        } }
    }
    if (showOnboarding) OnboardDialog({ showOnboarding = false }) { vm.onboard(it); showOnboarding = false }
}

@Composable
private fun OnboardDialog(dismiss: () -> Unit, submit: (OnboardEmployeeRequest) -> Unit) {
    var code by remember { mutableStateOf("") }; var first by remember { mutableStateOf("") }; var last by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var department by remember { mutableStateOf("") }; var designation by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = dismiss, shape = RoundedCornerShape(28.dp), icon = { Icon(Icons.Outlined.PersonAdd, null, tint = OrbitViolet) }, title = { Text("Onboard employee") }, text = {
        Column(Modifier.heightIn(max = 520.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(code, { code = it }, label = { Text("Employee code") }); OutlinedTextField(first, { first = it }, label = { Text("First name") }); OutlinedTextField(last, { last = it }, label = { Text("Last name") }); OutlinedTextField(email, { email = it }, label = { Text("Work email") }); OutlinedTextField(department, { department = it }, label = { Text("Department UUID") }); OutlinedTextField(designation, { designation = it }, label = { Text("Designation UUID") })
            Text("OrbitHR creates the profile first, then securely delivers the activation email.", style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
        }
    }, confirmButton = { Button(onClick = { submit(OnboardEmployeeRequest(code, first, last, email, department, designation, LocalDate.now().toString())) }, enabled = code.isNotBlank() && first.isNotBlank() && email.contains('@') && department.length == 36 && designation.length == 36) { Text("Onboard") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}

@Composable
private fun EmptyState(icon: ImageVector, title: String, message: String) {
    OrbitGlassCard(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(52.dp).background(OrbitViolet.copy(alpha = .09f), CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = OrbitViolet) }
            Text(title, style = MaterialTheme.typography.titleMedium, color = OrbitInk)
            Text(message, style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
        }
    }
}
