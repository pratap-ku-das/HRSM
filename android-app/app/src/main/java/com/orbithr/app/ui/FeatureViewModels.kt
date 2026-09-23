package com.orbithr.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.data.userMessage
import com.orbithr.app.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoadState<T>(val data: T? = null, val loading: Boolean = true, val error: String? = null)
data class OrganizationOptions(val departments: List<DepartmentDto>, val designations: List<DesignationDto>)
@HiltViewModel class HomeViewModel @Inject constructor(private val repo: OrbitRepository): ViewModel() { private val _state = MutableStateFlow(LoadState<DashboardDto>()); val state = _state.asStateFlow(); init { refresh() }; fun refresh() = viewModelScope.launch { _state.value = _state.value.copy(loading=true,error=null); runCatching { repo.dashboard() }.onSuccess { _state.value=LoadState(it,false) }.onFailure { _state.value=LoadState(error=it.userMessage(),loading=false) } } }
@HiltViewModel class AttendanceViewModel @Inject constructor(private val repo: OrbitRepository): ViewModel() { private val _state=MutableStateFlow(LoadState<List<AttendanceDto>>()); val state=_state.asStateFlow(); init{refresh()}; fun refresh()=viewModelScope.launch{runCatching{repo.attendance()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}}; fun punch(action:String, proof: AttendanceVerificationProof? = null)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.punch(action, proof)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}} }
@HiltViewModel class AttendanceRequestViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<AttendanceRequestDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.attendanceRequests()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun submit(body:CreateAttendanceRequest)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.submitAttendanceRequest(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}};fun breakAction(start:Boolean)=viewModelScope.launch{runCatching{if(start)repo.startBreak()else repo.endBreak()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}}}
data class ApprovalWorkspace(val inbox:List<ApprovalInboxDto>,val mine:List<WorkflowInstanceDto>)
@HiltViewModel class ApprovalViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<ApprovalWorkspace>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{ApprovalWorkspace(repo.approvalInbox(),repo.myRequests())}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun act(id:String,action:String,comment:String?=null)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.workflowAction(id,action,comment)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel class NotificationViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<NotificationDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.notifications()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun read(id:String)=viewModelScope.launch{runCatching{repo.readNotification(id)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}};fun readAll()=viewModelScope.launch{runCatching{repo.readAllNotifications()}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}}}
@HiltViewModel class LeaveViewModel @Inject constructor(private val repo: OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<LeavesDto>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.leaves()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun apply(body:ApplyLeaveRequest)=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.applyLeave(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel class PayViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<PayslipDto>>());val state=_state.asStateFlow();init{viewModelScope.launch{runCatching{repo.payslips()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}}}}
@HiltViewModel class ExpenseViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<List<ExpenseDto>>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{runCatching{repo.expenses()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun submit(body:SubmitExpenseRequest)=viewModelScope.launch{_state.value=_state.value.copy(loading=true);runCatching{repo.submitExpense(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(loading=false,error=it.userMessage())}}}
@HiltViewModel
class EmployeeViewModel @Inject constructor(private val repo: OrbitRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoadState<List<EmployeeDto>>())
    val state = _state.asStateFlow()

    private val _organization = MutableStateFlow(LoadState<OrganizationOptions>())
    val organization = _organization.asStateFlow()

    private val _onboarding = MutableStateFlow(LoadState<OnboardingDto>(loading = false))
    val onboarding = _onboarding.asStateFlow()

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
        runCatching { OrganizationOptions(repo.departments(), repo.designations()) }
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

    fun clearOnboardingResult() { _onboarding.value = LoadState(loading = false) }
}

@HiltViewModel class MobileWorkspaceViewModel @Inject constructor(private val repo:OrbitRepository):ViewModel(){private val _state=MutableStateFlow(LoadState<MobileWorkspaceDto>());val state=_state.asStateFlow();init{refresh()};fun refresh()=viewModelScope.launch{_state.value=_state.value.copy(loading=true,error=null);runCatching{repo.mobileWorkspace()}.onSuccess{_state.value=LoadState(it,false)}.onFailure{_state.value=LoadState(error=it.userMessage(),loading=false)}};fun request(body:CreateServiceRequest)=viewModelScope.launch{runCatching{repo.createServiceRequest(body)}.onSuccess{refresh()}.onFailure{_state.value=_state.value.copy(error=it.userMessage())}}}
