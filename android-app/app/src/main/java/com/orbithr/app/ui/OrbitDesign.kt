package com.orbithr.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

val OrbitHeroBrush = Brush.linearGradient(listOf(Color(0xFF242058), OrbitIndigo, OrbitViolet))
val OrbitActionBrush = Brush.horizontalGradient(listOf(OrbitViolet, Color(0xFF8C55F6)))

@Composable
fun OrbitBackground(content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(OrbitCloud),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Color(0x1213BCEB), radius = size.minDimension * .38f, center = Offset(size.width * .94f, size.height * .08f))
            drawCircle(Color(0x106750F4), radius = size.minDimension * .44f, center = Offset(size.width * .04f, size.height * .86f))
            drawCircle(Color.White.copy(alpha = .75f), radius = size.minDimension * .3f, center = Offset(size.width * .7f, size.height * .55f))
        }
        content()
    }
}

@Composable
fun OrbitLogo(modifier: Modifier = Modifier, compact: Boolean = false, light: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(if (compact) 34.dp else 46.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2, size.height / 2)
                drawCircle(if (light) Color.White.copy(alpha = .16f) else Color(0xFFEAE6FF), radius = size.width * .48f, center = center)
                drawCircle(if (light) OrbitCyan else OrbitViolet, radius = size.width * .19f, center = Offset(size.width * .35f, size.height * .42f))
                drawCircle(if (light) Color.White else OrbitCyan, radius = size.width * .16f, center = Offset(size.width * .66f, size.height * .55f))
                drawCircle(if (light) OrbitAmber else OrbitIndigo, radius = size.width * .11f, center = Offset(size.width * .47f, size.height * .77f))
            }
        }
        Text(
            "OrbitHR",
            style = if (compact) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Black,
            color = if (light) Color.White else OrbitInk,
        )
    }
}

@Composable
fun OrbitPageHeader(
    eyebrow: String,
    title: String,
    subtitle: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 18.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelMedium, color = OrbitViolet)
            Text(title, style = MaterialTheme.typography.headlineMedium, color = OrbitInk)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = OrbitMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        action?.invoke()
    }
}

@Composable
fun OrbitIconButton(icon: ImageVector, description: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = Color.White,
        shadowElevation = 5.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE9EAF3)),
    ) { Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { Icon(icon, description, tint = OrbitInk, modifier = Modifier.size(20.dp)) } }
}

@Composable
fun OrbitGlassCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = modifier.shadow(10.dp, RoundedCornerShape(24.dp), ambientColor = Color(0x18251C67), spotColor = Color(0x18251C67)),
        shape = RoundedCornerShape(24.dp),
        color = Color.White.copy(alpha = .96f),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White),
    ) { Column(Modifier.padding(18.dp), content = content) }
}

@Composable
fun OrbitSectionTitle(title: String, caption: String? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = OrbitInk)
            if (caption != null) Text(caption, style = MaterialTheme.typography.bodySmall, color = OrbitMuted)
        }
        trailing?.invoke()
    }
}

@Composable
fun OrbitStatusBadge(label: String, color: Color) {
    Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = .11f)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(6.dp).background(color, CircleShape))
            Text(label.replace('_', ' '), style = MaterialTheme.typography.labelMedium, color = color)
        }
    }
}

fun orbitStatusColor(status: String): Color = when (status.uppercase()) {
    "PRESENT", "APPROVED", "PAID", "PUBLISHED", "ACTIVE" -> OrbitMint
    "LATE", "PENDING", "ON_PROBATION" -> OrbitAmber
    "ABSENT", "REJECTED", "FAILED" -> OrbitRose
    else -> OrbitViolet
}
