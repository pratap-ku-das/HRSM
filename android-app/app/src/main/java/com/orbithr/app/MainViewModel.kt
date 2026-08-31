package com.orbithr.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.data.userMessage
import com.orbithr.app.core.model.MeDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SessionState { data object Loading : SessionState; data object SignedOut : SessionState; data class SignedIn(val me: MeDto) : SessionState }
@HiltViewModel class MainViewModel @Inject constructor(private val repository: OrbitRepository) : ViewModel() {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading); val state: StateFlow<SessionState> = _state.asStateFlow()
    private val _error = MutableStateFlow<String?>(null); val error: StateFlow<String?> = _error.asStateFlow()
    init { viewModelScope.launch { _state.value = repository.restore()?.let(SessionState::SignedIn) ?: SessionState.SignedOut } }
    fun login(email: String, password: String) = viewModelScope.launch { _error.value = null; _state.value = SessionState.Loading; runCatching { repository.login(email, password) }.onSuccess { _state.value = SessionState.SignedIn(it) }.onFailure { _error.value = it.userMessage(); _state.value = SessionState.SignedOut } }
    fun logout() = viewModelScope.launch { repository.logout(); _state.value = SessionState.SignedOut }
}
