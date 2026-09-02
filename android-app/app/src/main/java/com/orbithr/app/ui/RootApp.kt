package com.orbithr.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.*
import com.orbithr.app.SessionState
import com.orbithr.app.core.model.MeDto

@Composable fun RootApp(state: SessionState, error: String?, login: (String, String) -> Unit, logout: () -> Unit) = when (state) {
    SessionState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(); Text("Securely connecting...", Modifier.padding(top = 72.dp)) }
    SessionState.SignedOut -> LoginScreen(error, login)
    is SessionState.SignedIn -> SignedInApp(state.me, logout)
}

@Composable private fun LoginScreen(error: String?, login: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Column(Modifier.widthIn(max = 440.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("OrbitHR", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text("Sign in to your workspace", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Work email") }, leadingIcon = { Icon(Icons.Outlined.Email, null) }, singleLine = true)
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Password") }, leadingIcon = { Icon(Icons.Outlined.Lock, null) }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button({ login(email, password) }, Modifier.fillMaxWidth().height(52.dp), enabled = email.contains('@') && password.length >= 8) { Text("Sign in") }
        TextButton({}, enabled = false) { Text("Password reset email delivery is being completed") }
    } }
}

private data class Destination(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
@Composable private fun SignedInApp(me: MeDto, logout: () -> Unit) {
    val nav = rememberNavController(); val destinations = listOf(Destination("home", "Home", Icons.Outlined.Home), Destination("attendance", "Attendance", Icons.Outlined.Schedule), Destination("leave", "Leave", Icons.Outlined.EventAvailable), Destination("pay", "Pay", Icons.Outlined.ReceiptLong), Destination("more", "More", Icons.Outlined.MoreHoriz))
    Scaffold(bottomBar = { NavigationBar { val entry by nav.currentBackStackEntryAsState(); destinations.forEach { NavigationBarItem(selected = entry?.destination?.route == it.route, onClick = { nav.navigate(it.route) { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true } }, icon = { Icon(it.icon, it.label) }, label = { Text(it.label) }) } } }) { padding ->
        NavHost(nav, "home", Modifier.padding(padding)) {
            composable("home") { HomeScreen(me) }
            composable("attendance") { AttendanceScreen() }
            composable("leave") { LeaveScreen() }
            composable("pay") { PayslipScreen() }
            composable("more") { MoreScreen(me, logout, { nav.navigate("expenses") }, { nav.navigate("employees") }) }
            composable("expenses") { ExpenseScreen(back = { nav.popBackStack() }) }
            composable("employees") { EmployeeScreen(back = { nav.popBackStack() }) }
        }
    }
}
