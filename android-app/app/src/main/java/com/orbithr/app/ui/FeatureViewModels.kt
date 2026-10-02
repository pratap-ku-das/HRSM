package com.orbithr.app.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.data.userMessage
import com.orbithr.app.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.launch
import javax.inject.Inject
import dagger.hilt.android.qualifiers.ApplicationContext
import com.orbithr.app.tracking.WorkdayTrackingService

data class LoadState<T>(val data: T? = null, val loading: Boolean = true, val error: String? = null)
data class OrganizationOptions(val departments: List<DepartmentDto>, val designations: List<DesignationDto>,val salaryStructures:List<SalaryStructureOptionDto> = emptyList())
@HiltViewModel class SecurityViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<SecurityWorkspace>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.securityWorkspace()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun beginSetup()=viewModelScope.launch{runCatching{repo.setupMfa()}.onSuccess{setup->_state.value=_state.value.copy(data=_state.value.data?.copy(setup=setup),error=null)}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun confirm(code:String)=viewModelScope.launch{runCatching{repo.confirmMfa(code)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun disable(code:String)=viewModelScope.launch{runCatching{repo.disableMfa(code)}.onSuccess{result->_state.value=_state.value.copy(data=_state.value.data?.copy(mfa=MfaStatusDto(false),setup=null,reauthenticationRequired=result.reauthenticationRequired),error=null)}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun revoke(id:String)=viewModelScope.launch{runCatching{repo.revokeSecuritySession(id)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}}}
@HiltViewModel class OperationsViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<OperationsWorkspaceDto>());val state=_state.asStateFlow();private val _opened=MutableStateFlow<OpenedDocument?>(null);val opened=_opened.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.operationsWorkspace()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun upload(file:PendingFile)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.uploadCompanyDocument(file)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}};fun open(id:String)=viewModelScope.launch{runCatching{repo.openCompanyDocument(id)}.onSuccess{_opened.value=it}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun consumeOpened(){_opened.value=null}}
@HiltViewModel class SettingsViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<WorkspaceSettingsDto>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.workspaceSettings()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun save(body:WorkspaceSettingsDto)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.updateWorkspaceSettings(body)}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel class HomeViewModel @Inject constructor(private val repo: OrbitRepository): ViewModel() { private val _state = MutableStateFlow(LoadState<DashboardDto>()); val state = _state.asStateFlow(); init { refresh() }; fun refresh() = viewModelScope.launch { _state.value = _state.value.copy(loading=true,error=null); runCatching { repo.dashboard() }.onSuccess { _state.value=LoadState(it,false) }.onFailure { _state.value=LoadState(error=it.userMessage(),loading=false) } } }
@HiltViewModel class AttendanceViewModel @Inject constructor(private val repo: OrbitRepository,@ApplicationContext private val context:Context): ViewModel() { private val _state=MutableStateFlow(LoadState<List<AttendanceDto>>()); val state=_state.asStateFlow();private val _tracking=MutableStateFlow<TrackingStatusDto?>(null);val tracking=_tracking.asStateFlow(); val pendingOfflineCount: StateFlow<Int> = repo.pendingPunchCount().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0); init{refresh()}; fun refresh()=viewModelScope.launch{runCatching{repo.attendance()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)};runCatching{repo.trackingStatus()}.onSuccess{status->_tracking.value=status;if(status.active)WorkdayTrackingService.start(context)else WorkdayTrackingService.stop(context)}}; fun punch(action:String, proof: AttendanceVerificationProof? = null)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.punch(action, proof)}.onSuccess{record->if(action=="CLOCK_IN"&&record.workdayGpsTrackingEnabled)WorkdayTrackingService.start(context);if(action=="CLOCK_OUT")WorkdayTrackingService.stop(context);refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}} }
@HiltViewModel class AttendanceRequestViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<AttendanceRequestDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.attendanceRequests()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun submit(body:CreateAttendanceRequest)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.submitAttendanceRequest(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}};fun breakAction(start:Boolean)=viewModelScope.launch{runCatching{if(start)repo.startBreak()else repo.endBreak()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}}}
data class ApprovalWorkspace(val inbox:List<ApprovalInboxDto>,val mine:List<WorkflowInstanceDto>)
@HiltViewModel class ApprovalViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<ApprovalWorkspace>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{ApprovalWorkspace(repo.approvalInbox(),repo.myRequests())}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun act(id:String,action:String,comment:String?=null)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.workflowAction(id,action,comment)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel class NotificationViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<NotificationDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.notifications()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun read(id:String)=viewModelScope.launch{runCatching{repo.readNotification(id)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun readAll()=viewModelScope.launch{runCatching{repo.readAllNotifications()}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}}}
@HiltViewModel class LeaveViewModel @Inject constructor(private val repo: OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<LeavesDto>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.leaves()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun apply(body:ApplyLeaveRequest)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.applyLeave(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel class PayViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<PayslipDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.payslips()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}}}
@HiltViewModel class PayrollAdminViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<PayrollConfigurationOptionDto>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.payrollConfiguration()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun create(month:String)=viewModelScope.launch{_state.value=_state.value.copy(loading=true);runCatching{repo.createPayrollRun(month)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}};fun advance(run:PayrollRunMobileDto)=viewModelScope.launch{_state.value=_state.value.copy(loading=true);runCatching{repo.advancePayroll(run)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel class ExpenseViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<ExpenseDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.expenses()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun submit(body:SubmitExpenseRequest)=viewModelScope.launch{_state.value=_state.value.copy(loading=true);runCatching{repo.submitExpense(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel
class EmployeeViewModel @Inject constructor(private val repo: OrbitRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoadState<List<EmployeeDto>>())
    val state = _state.asStateFlow()

    private val _organization = MutableStateFlow(LoadState<OrganizationOptions>())
    val organization = _organization.asStateFlow()

    private val _onboarding = MutableStateFlow(LoadState<OnboardingDto>(loading = false))
    val onboarding = _onboarding.asStateFlow()
    private val _mutationError=MutableStateFlow<String?>(null)
    val mutationError=_mutationError.asStateFlow()

    init {
        search()
        loadOrganization()
    }

    fun search(value: String? = null) = viewModelScope.launch {
        _state.value = _state.value.copy(loading = true)
        runCatching { repo.employees(1, value) }
            .onSuccess { _state.value = LoadState(it, false) }
            .onFailure { _state.value = LoadState(error = it.userMessage(), loading = false) }
    }

    fun loadOrganization() = viewModelScope.launch {
        _organization.value = _organization.value.copy(loading = true, error = null)
        runCatching { OrganizationOptions(repo.departments(), repo.designations(),repo.salaryStructures()) }
            .onSuccess { _organization.value = LoadState(it, false) }
            .onFailure { _organization.value = LoadState(error = it.userMessage(), loading = false) }
    }

    fun onboard(body: OnboardEmployeeRequest) = viewModelScope.launch {
        _onboarding.value = LoadState(loading = true)
        runCatching { repo.onboard(body) }
            .onSuccess {
                _onboarding.value = LoadState(it, loading = false)
                search()
            }
            .onFailure { _onboarding.value = LoadState(error = it.userMessage(), loading = false) }
    }

    fun onboardStaged(body: MobileOnboardingRequest) = viewModelScope.launch {
        _onboarding.value = LoadState(loading = true)
        runCatching { repo.onboardStaged(body) }
            .onSuccess { _onboarding.value = LoadState(it, loading = false); search() }
            .onFailure { _onboarding.value = LoadState(error = it.userMessage(), loading = false) }
    }

    fun clearOnboardingResult() { _onboarding.value = LoadState(loading = false) }
    fun update(id:String,body:UpdateEmployeeRequest)=viewModelScope.launch{runCatching{repo.updateEmployee(id,body)}.onSuccess{_mutationError.value=null;search(null)}.onFailure{_mutationError.value=it.userMessage()}}
    fun lifecycle(id:String,body:EmployeeLifecycleRequest)=viewModelScope.launch{runCatching{repo.updateEmployeeLifecycle(id,body)}.onSuccess{_mutationError.value=null;search(null)}.onFailure{_mutationError.value=it.userMessage()}}
    fun delete(id:String)=viewModelScope.launch{runCatching{repo.deleteEmployee(id)}.onSuccess{_mutationError.value=null;search(null)}.onFailure{_mutationError.value=it.userMessage()}}
}

@HiltViewModel class MobileWorkspaceViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<MobileWorkspaceDto>());val state=_state.asStateFlow();private val _opened=MutableStateFlow<OpenedDocument?>(null);val opened=_opened.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.mobileWorkspace()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun request(body:CreateServiceRequest)=viewModelScope.launch{runCatching{repo.createServiceRequest(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun openDocument(id:String)=viewModelScope.launch{runCatching{repo.openEmployeeDocument(id)}.onSuccess{_opened.value=it}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun consumeOpened(){_opened.value=null}}
