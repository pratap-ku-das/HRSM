package com.orbithr.app.core.network

import com.orbithr.app.core.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface OrbitApi {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): ApiEnvelope<SessionDto>
    @POST("auth/refresh") suspend fun refresh(@Body body: RefreshRequest): ApiEnvelope<SessionDto>
    @POST("auth/logout") suspend fun logout(@Body body: RefreshRequest): ApiEnvelope<Map<String, Boolean>>
    @GET("me") suspend fun me(): ApiEnvelope<MeDto>
    @GET("dashboard") suspend fun dashboard(): ApiEnvelope<DashboardDto>
    @GET("me/attendance") suspend fun attendance(@Query("from") from: String? = null): ApiEnvelope<List<AttendanceDto>>
    @POST("me/face/challenge") suspend fun faceChallenge(@Body body: FaceChallengeRequest): ApiEnvelope<FaceChallengeDto>
    @Multipart @POST("me/face/verify") suspend fun verifyFace(
        @Part selfie: MultipartBody.Part,
        @Part("challengeId") challengeId: RequestBody,
        @Part("deviceId") deviceId: RequestBody,
        @Part("livenessVerified") livenessVerified: RequestBody,
    ): ApiEnvelope<FaceVerificationDto>
    @POST("me/attendance/punch") suspend fun punch(@Body body: PunchRequest): ApiEnvelope<AttendanceDto>
    @GET("me/leaves") suspend fun leaves(): ApiEnvelope<LeavesDto>
    @POST("me/leaves") suspend fun applyLeave(@Body body: ApplyLeaveRequest): ApiEnvelope<LeaveRequestDto>
    @GET("me/payslips") suspend fun payslips(): ApiEnvelope<List<PayslipDto>>
    @GET("me/expenses") suspend fun expenses(): ApiEnvelope<List<ExpenseDto>>
    @POST("me/expenses") suspend fun submitExpense(@Body body: SubmitExpenseRequest): ApiEnvelope<ExpenseDto>
    @GET("employees") suspend fun employees(@Query("page") page: Int, @Query("pageSize") pageSize: Int = 25, @Query("search") search: String? = null): ApiEnvelope<List<EmployeeDto>>
    @POST("employees/onboard") suspend fun onboard(@Header("Idempotency-Key") key: String, @Body body: OnboardEmployeeRequest): ApiEnvelope<OnboardingDto>
}
