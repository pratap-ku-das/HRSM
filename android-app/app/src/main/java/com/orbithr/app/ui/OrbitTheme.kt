package com.orbithr.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(primary = Color(0xFF087F5B), secondary = Color(0xFF3454D1), background = Color(0xFFF7F9FC), surface = Color.White, error = Color(0xFFBA1A1A))
private val Dark = darkColorScheme(primary = Color(0xFF63D5AE), secondary = Color(0xFFB8C3FF), background = Color(0xFF101418), surface = Color(0xFF181D22))
@Composable fun OrbitTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) { MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Typography(), content = content) }
