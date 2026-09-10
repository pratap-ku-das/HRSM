package com.orbithr.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.*
import com.orbithr.app.SessionState
import com.orbithr.app.core.model.AttendanceVerificationResult
import com.orbithr.app.core.model.MeDto

@Composable
fun RootApp(
    state: SessionState,
    error: String?,
    login: (String, String) -> Unit,
    logout: () -> Unit,
    verifyAttendance: (String, (AttendanceVerificationResult) -> Unit) -> Unit,
) = when (state) {
    SessionState.Loading -> OrbitSplash()
    SessionState.SignedOut -> LoginScreen(error, login)
    is SessionState.SignedIn -> SignedInApp(state.me, logout, verifyAttendance)
}

@Composable
private fun OrbitSplash() {
    Box(Modifier.fillMaxSize().background(OrbitHeroBrush), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(22.dp)) {
            OrbitLogo(light = true)
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
            Text("Preparing your workspace", color = Color.White.copy(alpha = .72f), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun LoginScreen(error: String?, login: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    OrbitBackground {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp, vertical = 20.dp),
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(32.dp),
                color = Color.Transparent,
            ) {
                Box(Modifier.background(OrbitHeroBrush).padding(24.dp)) {
                    Column(verticalArrangement = Arrangement.spacedBy(22.dp)) {
                        OrbitLogo(light = true)
                        Spacer(Modifier.height(20.dp))
                        Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = .12f)) {
                            Row(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                Icon(Icons.Outlined.AutoAwesome, null, tint = OrbitCyan, modifier = Modifier.size(16.dp))
                                Text("Your workday, beautifully connected", color = Color.White, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                        Text("Welcome back\nto better work.", style = MaterialTheme.typography.displaySmall, color = Color.White)
                        Text("Attendance, leave, pay and your entire employee experience—in one secure space.", color = Color.White.copy(alpha = .72f), style = MaterialTheme.typography.bodyMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            LoginTrustChip(Icons.Outlined.VerifiedUser, "Face secure")
                            LoginTrustChip(Icons.Outlined.LocationOn, "Location ready")
                        }
                    }
                }
            }

            Column(Modifier.padding(horizontal = 4.dp, vertical = 26.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                Text("Sign in", style = MaterialTheme.typography.headlineMedium, color = OrbitInk)
                Text("Use your registered work account", style = MaterialTheme.typography.bodyMedium, color = OrbitMuted)
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.trim() },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Work email") },
                    placeholder = { Text("you@company.com") },
                    leadingIcon = { Icon(Icons.Outlined.AlternateEmail, null, tint = OrbitViolet) },
                    singleLine = true,
                    shape = RoundedCornerShape(18.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Password") },
                    leadingIcon = { Icon(Icons.Outlined.Lock, null, tint = OrbitViolet) },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, if (passwordVisible) "Hide password" else "Show password")
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(18.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                )
                error?.let {
                    Surface(shape = RoundedCornerShape(16.dp), color = OrbitRose.copy(alpha = .09f)) {
                        Row(Modifier.fillMaxWidth().padding(13.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.ErrorOutline, null, tint = OrbitRose, modifier = Modifier.size(19.dp))
                            Text(it, color = Color(0xFFB93259), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Button(
                    onClick = { login(email.lowercase(), password) },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    enabled = email.contains('@') && password.length >= 8,
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrbitViolet),
                ) {
                    Text("Enter your workspace")
                    Spacer(Modifier.width(10.dp))
                    Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, modifier = Modifier.size(18.dp))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Lock, null, tint = OrbitMint, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Encrypted connection · OrbitHR Secure", style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
                }
            }
        }
    }
}

@Composable
private fun RowScope.LoginTrustChip(icon: ImageVector, label: String) {
    Surface(modifier = Modifier.weight(1f), shape = RoundedCornerShape(15.dp), color = Color.White.copy(alpha = .1f)) {
        Row(Modifier.padding(11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(icon, null, tint = OrbitCyan, modifier = Modifier.size(17.dp))
            Text(label, color = Color.White, style = MaterialTheme.typography.labelMedium)
        }
    }
}

private data class Destination(val route: String, val label: String, val icon: ImageVector, val activeIcon: ImageVector)

@Composable
private fun SignedInApp(me: MeDto, logout: () -> Unit, verifyAttendance: (String, (AttendanceVerificationResult) -> Unit) -> Unit) {
    val nav = rememberNavController()
    val destinations = listOf(
        Destination("home", "Home", Icons.Outlined.Home, Icons.Outlined.Home),
        Destination("attendance", "Time", Icons.Outlined.Schedule, Icons.Outlined.Timer),
        Destination("leave", "Leave", Icons.Outlined.EventAvailable, Icons.Outlined.EventAvailable),
        Destination("pay", "Pay", Icons.Outlined.AccountBalanceWallet, Icons.Outlined.AccountBalanceWallet),
        Destination("more", "More", Icons.Outlined.GridView, Icons.Outlined.GridView),
    )
    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            val entry by nav.currentBackStackEntryAsState()
            val current = entry?.destination?.route
            Surface(
                modifier = Modifier.navigationBarsPadding().padding(horizontal = 14.dp, vertical = 10.dp).fillMaxWidth(),
                shape = RoundedCornerShape(26.dp),
                color = Color(0xFF171932),
                shadowElevation = 16.dp,
            ) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 7.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    destinations.forEach { item ->
                        val selected = current == item.route
                        Column(
                            modifier = Modifier
                                .clip(RoundedCornerShape(18.dp))
                                .clickable {
                                    nav.navigate(item.route) {
                                        popUpTo("home") { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                                .padding(horizontal = 13.dp, vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Box(
                                Modifier
                                    .size(width = 34.dp, height = 25.dp)
                                    .background(if (selected) Brush.horizontalGradient(listOf(OrbitViolet, OrbitCyan)) else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent)), RoundedCornerShape(50)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(if (selected) item.activeIcon else item.icon, item.label, tint = if (selected) Color.White else Color(0xFF9CA1BD), modifier = Modifier.size(18.dp))
                            }
                            Text(item.label, style = MaterialTheme.typography.labelMedium, color = if (selected) Color.White else Color(0xFF9CA1BD), textAlign = TextAlign.Center)
                        }
                    }
                }
            }
        },
    ) { padding ->
        OrbitBackground {
            NavHost(nav, "home", Modifier.padding(padding)) {
                composable("home") { HomeScreen(me, attendance = { nav.navigate("attendance") }, leave = { nav.navigate("leave") }, pay = { nav.navigate("pay") }) }
                composable("attendance") { AttendanceScreen(verifyAttendance) }
                composable("leave") { LeaveScreen() }
                composable("pay") { PayslipScreen() }
                composable("more") { MoreScreen(me, logout, { nav.navigate("expenses") }, { nav.navigate("employees") }) }
                composable("expenses") { ExpenseScreen(back = { nav.popBackStack() }) }
                composable("employees") { EmployeeScreen(back = { nav.popBackStack() }) }
            }
        }
    }
}
