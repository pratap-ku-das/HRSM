package com.orbithr.app.core.network

import com.orbithr.app.core.auth.TokenStore
import com.orbithr.app.core.model.RefreshRequest
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject

class TokenAuthenticator @Inject constructor(private val tokens: TokenStore, private val refreshApi: RefreshApi) : Authenticator {
    private val lock = Any()
    override fun authenticate(route: Route?, response: Response): Request? = synchronized(lock) {
        if (responseCount(response) >= 2) return@synchronized null
        val failed = response.request.header("Authorization")
        val current = tokens.access()?.let { "Bearer $it" }
        if (current != null && current != failed) return@synchronized response.request.newBuilder().header("Authorization", current).build()
        val refresh = runBlocking { tokens.refresh() } ?: return@synchronized null
        val session = runCatching { refreshApi.refresh(RefreshRequest(refresh, android.os.Build.MODEL)).execute().body()?.data }.getOrNull()
        if (session == null) { runBlocking { tokens.clear() }; return@synchronized null }
        runBlocking { tokens.save(session.accessToken, session.refreshToken) }
        response.request.newBuilder().header("Authorization", "Bearer ${session.accessToken}").build()
    }
    private fun responseCount(response: Response): Int { var count = 1; var prior = response.priorResponse; while (prior != null) { count++; prior = prior.priorResponse }; return count }
}
