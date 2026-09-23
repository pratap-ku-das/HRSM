package com.orbithr.app.core.network

import com.orbithr.app.core.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface OrbitApi {
    @GET("mobile/android-release") suspend fun androidRelease(): ApiEnvelope<AndroidReleaseDto>
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
    @GET("me/attendance/requests") suspend fun attendanceRequests(): ApiEnvelope<List<AttendanceRequestDto>>
    @POST("me/attendance/requests") suspend fun submitAttendanceRequest(@Body body: CreateAttendanceRequest): ApiEnvelope<AttendanceRequestDto>
    @POST("me/attendance/breaks/start") suspend fun startBreak(): ApiEnvelope<BreakSessionDto>
    @POST("me/attendance/breaks/end") suspend fun endBreak(): ApiEnvelope<BreakSessionDto>
    @GET("workflows/inbox") suspend fun approvalInbox(): ApiEnvelope<List<ApprovalInboxDto>>
    @GET("workflows/my-requests") suspend fun myRequests(): ApiEnvelope<List<WorkflowInstanceDto>>
    @POST("workflows/instances/{id}/actions") suspend fun workflowAction(@Path("id") id: String, @Body body: WorkflowActionRequest): ApiEnvelope<WorkflowActionResult>
    @GET("notifications") suspend fun notifications(): ApiEnvelope<List<NotificationDto>>
    @PATCH("notifications/{id}/read") suspend fun readNotification(@Path("id") id: String): ApiEnvelope<Map<String, Boolean>>
    @POST("notifications/read-all") suspend fun readAllNotifications(): ApiEnvelope<Map<String, Int>>
    @GET("me/mobile-workspace") suspend fun mobileWorkspace(): ApiEnvelope<MobileWorkspaceDto>
    @POST("me/service-requests") suspend fun createServiceRequest(@Body body:CreateServiceRequest):ApiEnvelope<ServiceRequestDto>
    @GET("me/leaves") suspend fun leaves(): ApiEnvelope<LeavesDto>
    @POST("me/leaves") suspend fun applyLeave(@Body body: ApplyLeaveRequest): ApiEnvelope<LeaveRequestDto>
    @GET("me/payslips") suspend fun payslips(): ApiEnvelope<List<PayslipDto>>
    @GET("me/expenses") suspend fun expenses(): ApiEnvelope<List<ExpenseDto>>
    @POST("me/expenses") suspend fun submitExpense(@Body body: SubmitExpenseRequest): ApiEnvelope<ExpenseDto>
    @GET("departments") suspend fun departments(): ApiEnvelope<List<DepartmentDto>>
    @GET("designations") suspend fun designations(): ApiEnvelope<List<DesignationDto>>
    @GET("employees") suspend fun employees(@Query("page") page: Int, @Query("pageSize") pageSize: Int = 25, @Query("search") search: String? = null): ApiEnvelope<List<EmployeeDto>>
    @POST("employees/onboard") suspend fun onboard(@Header("Idempotency-Key") key: String, @Body body: OnboardEmployeeRequest): ApiEnvelope<OnboardingDto>
}
