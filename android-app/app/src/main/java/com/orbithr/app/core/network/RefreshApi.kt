package com.orbithr.app.core.network

import com.orbithr.app.core.model.ApiEnvelope
import com.orbithr.app.core.model.RefreshRequest
import com.orbithr.app.core.model.SessionDto
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.POST

interface RefreshApi { @POST("auth/refresh") fun refresh(@Body body: RefreshRequest): Call<ApiEnvelope<SessionDto>> }
