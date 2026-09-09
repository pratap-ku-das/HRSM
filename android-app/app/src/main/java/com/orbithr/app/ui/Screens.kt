package com.orbithr.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import com.orbithr.app.core.model.*
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay

private val attendanceTimeFormat = DateTimeFormatter.ofPattern("HH:mm")

private fun String?.asLocalAttendanceTime(): String {
    if (this.isNullOrBlank()) return "--:--"
    return runCatching {
        Instant.parse(this).atZone(ZoneId.systemDefault()).format(attendanceTimeFormat)
    }.getOrElse { substringAfter('T').take(5) }
}

@Composable
private fun OrbitListItem(
    headline: @Composable () -> Unit,
    supporting: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    enabled: Boolean = true,
) {
    ListItem(
        headlineContent = headline,
        supportingContent = supporting,
        modifier = modifier,
        leadingContent = leading,
        trailingContent = trailing,
        colors = ListItemDefaults.colors(
            headlineColor = MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else .45f),
            supportingColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (enabled) 1f else .45f),
        ),
    )
}

@Composable
private fun Page(
    title: String,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp)) {
        Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            action?.invoke()
        }
        content()
    }
}

@Composable
private fun <T> StateBody(state: LoadState<T>, retry: () -> Unit, body: @Composable (T) -> Unit) {
    when {
        state.loading && state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        state.error != null && state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.CloudOff, contentDescription = null)
                Text(state.error)
                Button(onClick = retry) { Text("Retry") }
            }
        }
        state.data != null -> body(state.data)
    }
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier) { Column(Modifier.padding(16.dp)) {
        Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } }
}

@Composable
fun HomeScreen(me: MeDto, vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    Page("Hello, ${me.user.fullName.substringBefore(' ')}", action = { IconButton(onClick = vm::refresh) { Icon(Icons.Outlined.Refresh, "Refresh") } }) {
        StateBody(state, vm::refresh) { dashboard ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text(me.company.name, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
                item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Stat("Active employees", dashboard.activeEmployees.toString(), Modifier.weight(1f))
                    Stat("Present today", dashboard.presentToday.toString(), Modifier.weight(1f))
                } }
                item { Stat("Pending leave approvals", dashboard.pendingLeaves.toString(), Modifier.fillMaxWidth()) }
                if (dashboard.announcements.isNotEmpty()) item { Text("Announcements", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                items(dashboard.announcements, key = { it.id }) { announcement -> Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                    Text(announcement.title, fontWeight = FontWeight.Bold)
                    Text(announcement.content, maxLines = 3)
                } } }
                if (dashboard.holidays.isNotEmpty()) item { Text("Upcoming holidays", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                items(dashboard.holidays, key = { it.id }) { holiday -> OrbitListItem(
                    headline = { Text(holiday.name) }, supporting = { Text(holiday.date.substringBefore('T')) }, leading = { Icon(Icons.Outlined.Celebration, null) },
                ) }
            }
        }
    }
}

@Composable
fun AttendanceScreen(verifyAttendance: ((AttendanceVerificationResult) -> Unit) -> Unit, vm: AttendanceViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var confirmation by remember { mutableStateOf<String?>(null) }
    var proof by remember { mutableStateOf<AttendanceVerificationProof?>(null) }
    var verificationInProgress by remember { mutableStateOf(false) }
    var verificationMessage by remember { mutableStateOf("Face and precise location verification is required before clock-in.") }

    LaunchedEffect(proof?.verifiedAtMillis) {
        if (proof != null) {
            delay(60_000)
            proof = null
            verificationMessage = "Verification expired. Verify again before clock-in."
        }
    }

    Page("Attendance", action = { IconButton(onClick = vm::refresh) { Icon(Icons.Outlined.Refresh, "Refresh") } }) {
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(if (proof != null) Icons.Outlined.VerifiedUser else Icons.Outlined.Face, null, tint = if (proof != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(verificationMessage, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(
                    onClick = {
                        verificationInProgress = true
                        verificationMessage = "Waiting for face verification and current location..."
                        verifyAttendance { result ->
                            verificationInProgress = false
                            when (result) {
                                is AttendanceVerificationResult.Verified -> {
                                    proof = result.proof
                                    verificationMessage = "Face and location verified. Clock-in is enabled for 60 seconds."
                                }
                                is AttendanceVerificationResult.Failed -> {
                                    proof = null
                                    verificationMessage = result.message
                                }
                            }
                        }
                    },
                    enabled = !verificationInProgress && !state.loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (verificationInProgress) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Outlined.Face, null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (verificationInProgress) "Verifying..." else "Verify face & location")
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { confirmation = "CLOCK_IN" }, enabled = proof != null && !state.loading, modifier = Modifier.weight(1f)) { Icon(Icons.Outlined.Login, null); Spacer(Modifier.width(6.dp)); Text("Clock in") }
            OutlinedButton(onClick = { confirmation = "CLOCK_OUT" }, enabled = !state.loading, modifier = Modifier.weight(1f)) { Icon(Icons.Outlined.Logout, null); Spacer(Modifier.width(6.dp)); Text("Clock out") }
        }
        Spacer(Modifier.height(12.dp))
        StateBody(state, vm::refresh) { records ->
            if (records.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No attendance records yet") }
            else LazyColumn { items(records, key = { it.id }) { record -> OrbitListItem(
                headline = { Text(record.date.substringBefore('T'), fontWeight = FontWeight.SemiBold) },
                supporting = { Text("${record.clockInTime.asLocalAttendanceTime()} to ${record.clockOutTime.asLocalAttendanceTime()}${if (record.faceAuthVerified) " • Face + location" else ""}") },
                leading = { Icon(Icons.Outlined.Schedule, null) }, trailing = { Text(record.status) },
            ) } }
        }
    }
    confirmation?.let { action -> AlertDialog(
        onDismissRequest = { confirmation = null },
        title = { Text("Confirm attendance") },
        text = { Text(if (action == "CLOCK_IN") "Your verified face, location and the server time will be recorded now." else "Use the server time to clock out now?") },
        confirmButton = { Button(onClick = {
            val verifiedProof = proof
            confirmation = null
            if (action == "CLOCK_IN" && verifiedProof != null) {
                proof = null
                verificationMessage = "Face and precise location verification is required before clock-in."
                vm.punch(action, verifiedProof)
            } else if (action == "CLOCK_OUT") vm.punch(action)
        }, enabled = action == "CLOCK_OUT" || proof != null) { Text("Confirm") } },
        dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Cancel") } },
    ) }
}

@Composable
fun LeaveScreen(vm: LeaveViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState(); var showForm by remember { mutableStateOf(false) }
    Page("Leave", action = { IconButton(onClick = { showForm = true }) { Icon(Icons.Outlined.Add, "Apply for leave") } }) {
        StateBody(state, vm::refresh) { data -> LazyColumn {
            item { Text("Policies", fontWeight = FontWeight.Bold) }
            items(data.types, key = { it.id }) { type -> OrbitListItem({ Text(type.name) }, { Text("${type.daysAllowedPerYear} days per year") }) }
            item { HorizontalDivider(); Text("My requests", Modifier.padding(vertical = 12.dp), fontWeight = FontWeight.Bold) }
            items(data.requests, key = { it.id }) { request -> OrbitListItem(
                { Text(request.leaveType?.name ?: "Leave") },
                { Text("${request.startDate.substringBefore('T')} - ${request.endDate.substringBefore('T')}") },
                trailing = { Text(request.status) },
            ) }
        } }
    }
    if (showForm) LeaveDialog(state.data?.types.orEmpty(), { showForm = false }) { vm.apply(it); showForm = false }
}

@Composable
private fun LeaveDialog(types: List<LeaveTypeDto>, dismiss: () -> Unit, submit: (ApplyLeaveRequest) -> Unit) {
    var type by remember(types) { mutableStateOf(types.firstOrNull()?.id.orEmpty()) }
    var start by remember { mutableStateOf(LocalDate.now().toString()) }; var end by remember { mutableStateOf(LocalDate.now().toString()) }; var reason by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Apply for leave") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(types.firstOrNull { it.id == type }?.name ?: "No leave policies available")
        OutlinedTextField(start, { start = it }, label = { Text("Start date (YYYY-MM-DD)") })
        OutlinedTextField(end, { end = it }, label = { Text("End date (YYYY-MM-DD)") })
        OutlinedTextField(reason, { reason = it }, label = { Text("Reason") })
    } }, confirmButton = { Button(onClick = { submit(ApplyLeaveRequest(type, start, end, reason)) }, enabled = type.isNotBlank() && reason.length >= 3) { Text("Submit") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}

@Composable
fun PayslipScreen(vm: PayViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    Page("Payslips") { StateBody(state, retry = {}) { payslips ->
        if (payslips.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No published payslips") }
        else LazyColumn { items(payslips, key = { it.id }) { payslip -> Card(Modifier.fillMaxWidth().padding(vertical = 5.dp)) { OrbitListItem(
            { Text(payslip.month, fontWeight = FontWeight.Bold) },
            { Text("Gross INR ${"%,.0f".format(payslip.grossSalary)} | Deductions INR ${"%,.0f".format(payslip.totalDeductions)}") },
            trailing = { Column(horizontalAlignment = Alignment.End) { Text("INR ${"%,.0f".format(payslip.netSalary)}", fontWeight = FontWeight.Bold); Text(payslip.status) } },
        ) } } }
    } }
}

@Composable
fun ExpenseScreen(back: () -> Unit, vm: ExpenseViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState(); var showForm by remember { mutableStateOf(false) }
    Page("Expenses", action = { Row { IconButton(onClick = back) { Icon(Icons.Outlined.ArrowBack, "Back") }; IconButton(onClick = { showForm = true }) { Icon(Icons.Outlined.Add, "Submit expense") } } }) {
        StateBody(state, vm::refresh) { expenses -> if (expenses.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No expense claims") }
        else LazyColumn { items(expenses, key = { it.id }) { expense -> OrbitListItem(
            { Text(expense.title, fontWeight = FontWeight.SemiBold) }, { Text("${expense.category} | ${expense.expenseDate.substringBefore('T')}") },
            trailing = { Column(horizontalAlignment = Alignment.End) { Text("INR ${"%,.0f".format(expense.amount)}"); Text(expense.status) } },
        ) } } }
    }
    if (showForm) ExpenseDialog({ showForm = false }) { vm.submit(it); showForm = false }
}

@Composable
private fun ExpenseDialog(dismiss: () -> Unit, submit: (SubmitExpenseRequest) -> Unit) {
    var title by remember { mutableStateOf("") }; var amount by remember { mutableStateOf("") }; var notes by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Submit expense") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(title, { title = it }, label = { Text("Title") })
        OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Amount (INR)") })
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes") })
        Text("Receipt upload will be enabled when the authenticated file API is deployed.", style = MaterialTheme.typography.bodySmall)
    } }, confirmButton = { Button(onClick = { submit(SubmitExpenseRequest(title, "MISC", amount.toDoubleOrNull() ?: 0.0, LocalDate.now().toString(), notes)) }, enabled = title.length >= 3 && (amount.toDoubleOrNull() ?: 0.0) > 0) { Text("Submit") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}

@Composable
fun MoreScreen(me: MeDto, logout: () -> Unit, expenses: () -> Unit, employees: () -> Unit) {
    Page("More") { LazyColumn {
        item { OrbitListItem({ Text(me.user.fullName, fontWeight = FontWeight.Bold) }, { Text("${me.user.role} | ${me.user.email}") }, leading = { Icon(Icons.Outlined.AccountCircle, null) }) }
        item { HorizontalDivider() }
        item { OrbitListItem({ Text("Expenses") }, { Text("Submit and track claims") }, leading = { Icon(Icons.Outlined.ReceiptLong, null) }, trailing = { IconButton(onClick = expenses) { Icon(Icons.Outlined.ChevronRight, "Open") } }) }
        if ("employee.read.all" in me.user.permissions) item { OrbitListItem({ Text("Employees") }, { Text("Directory and onboarding") }, leading = { Icon(Icons.Outlined.Groups, null) }, trailing = { IconButton(onClick = employees) { Icon(Icons.Outlined.ChevronRight, "Open") } }) }
        items(listOf("Documents" to "Secure file API pending", "Goals" to "Performance API pending", "Assets" to "Asset API pending", "Notifications" to "FCM registration pending")) { row -> OrbitListItem({ Text(row.first) }, { Text(row.second) }, leading = { Icon(Icons.Outlined.Info, null) }, enabled = false) }
        item { HorizontalDivider(); TextButton(onClick = logout, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Logout, null); Spacer(Modifier.width(8.dp)); Text("Sign out") } }
    } }
}

@Composable
fun EmployeeScreen(back: () -> Unit, vm: EmployeeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState(); var search by remember { mutableStateOf("") }; var showOnboarding by remember { mutableStateOf(false) }
    Page("Employees", action = { Row { IconButton(onClick = back) { Icon(Icons.Outlined.ArrowBack, "Back") }; IconButton(onClick = { showOnboarding = true }) { Icon(Icons.Outlined.PersonAdd, "Onboard employee") } } }) {
        OutlinedTextField(search, { search = it; vm.search(it.takeIf(String::isNotBlank)) }, Modifier.fillMaxWidth(), label = { Text("Search employees") }, leadingIcon = { Icon(Icons.Outlined.Search, null) })
        StateBody(state, { vm.search(search) }) { employees -> LazyColumn { items(employees, key = { it.id }) { employee -> OrbitListItem(
            { Text("${employee.firstName} ${employee.lastName}", fontWeight = FontWeight.SemiBold) },
            { Text("${employee.employeeCode} | ${employee.designation?.title ?: "No designation"}") },
            leading = { Icon(Icons.Outlined.Person, null) }, trailing = { Text(employee.status) },
        ) } } }
    }
    if (showOnboarding) OnboardDialog({ showOnboarding = false }) { vm.onboard(it); showOnboarding = false }
}

@Composable
private fun OnboardDialog(dismiss: () -> Unit, submit: (OnboardEmployeeRequest) -> Unit) {
    var code by remember { mutableStateOf("") }; var first by remember { mutableStateOf("") }; var last by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var department by remember { mutableStateOf("") }; var designation by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = dismiss, title = { Text("Onboard employee") }, text = { Column(Modifier.heightIn(max = 520.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedTextField(code, { code = it }, label = { Text("Employee code") }); OutlinedTextField(first, { first = it }, label = { Text("First name") }); OutlinedTextField(last, { last = it }, label = { Text("Last name") }); OutlinedTextField(email, { email = it }, label = { Text("Work email") }); OutlinedTextField(department, { department = it }, label = { Text("Department UUID") }); OutlinedTextField(designation, { designation = it }, label = { Text("Designation UUID") })
        Text("The employee is created first; activation email delivery runs asynchronously.", style = MaterialTheme.typography.bodySmall)
    } }, confirmButton = { Button(onClick = { submit(OnboardEmployeeRequest(code, first, last, email, department, designation, LocalDate.now().toString())) }, enabled = code.isNotBlank() && first.isNotBlank() && email.contains('@') && department.length == 36 && designation.length == 36) { Text("Onboard") } }, dismissButton = { TextButton(onClick = dismiss) { Text("Cancel") } })
}
