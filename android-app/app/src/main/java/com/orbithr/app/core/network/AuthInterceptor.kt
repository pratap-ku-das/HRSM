package com.orbithr.app.core.network

import com.orbithr.app.core.auth.TokenStore
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class AuthInterceptor @Inject constructor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder().apply { tokens.access()?.let { header("Authorization", "Bearer $it") }; header("X-Request-Id", java.util.UUID.randomUUID().toString()) }.build()
        return chain.proceed(request)
    }
}
