package com.orbithr.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orbithr.app.core.data.OrbitRepository
import com.orbithr.app.core.data.userMessage
import com.orbithr.app.core.model.MeDto
import com.orbithr.app.core.model.AndroidReleaseDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SessionState { data object Loading : SessionState; data object SignedOut : SessionState; data class SignedIn(val me: MeDto) : SessionState }

sealed interface UpdateState {
    data object Idle : UpdateState
    data class Available(val release: AndroidReleaseDto) : UpdateState
    data class Downloading(val release: AndroidReleaseDto, val progress: Float) : UpdateState
    data class ReadyToInstall(val release: AndroidReleaseDto, val apkFile: java.io.File) : UpdateState
    data class Error(val release: AndroidReleaseDto, val message: String) : UpdateState
}

@HiltViewModel class MainViewModel @Inject constructor(private val repository: OrbitRepository) : ViewModel() {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading); val state: StateFlow<SessionState> = _state.asStateFlow()
    private val _error = MutableStateFlow<String?>(null); val error: StateFlow<String?> = _error.asStateFlow()
    private val _availableUpdate = MutableStateFlow<AndroidReleaseDto?>(null); val availableUpdate: StateFlow<AndroidReleaseDto?> = _availableUpdate.asStateFlow()
    private val _updateState = MutableStateFlow<UpdateState>(UpdateState.Idle); val updateState: StateFlow<UpdateState> = _updateState.asStateFlow()
    private val _recoveryMessage=MutableStateFlow<String?>(null);val recoveryMessage:StateFlow<String?> = _recoveryMessage.asStateFlow()
    private var updateDismissedInSession = false

    init {
        viewModelScope.launch { _state.value = repository.restore()?.let(SessionState::SignedIn) ?: SessionState.SignedOut }
        viewModelScope.launch {
            runCatching { repository.androidRelease() }
                .onSuccess { release ->
                    if (!updateDismissedInSession && shouldOfferUpdate(BuildConfig.VERSION_CODE, release.versionCode, release.minSupportedVersionCode)) {
                        _availableUpdate.value = release
                        _updateState.value = UpdateState.Available(release)
                    }
                }
        }
    }

    private var downloadJob: kotlinx.coroutines.Job? = null

    fun dismissUpdate() {
        cancelUpdateDownload()
        updateDismissedInSession = true
        _availableUpdate.value = null
        _updateState.value = UpdateState.Idle
    }

    fun startUpdateDownload(release: AndroidReleaseDto) {
        if (downloadJob?.isActive == true) return
        _updateState.value = UpdateState.Downloading(release, 0f)
        downloadJob = viewModelScope.launch {
            runCatching {
                repository.downloadAndVerifyApk(release) { progress ->
                    _updateState.value = UpdateState.Downloading(release, progress)
                }
            }.onSuccess { apkFile ->
                _updateState.value = UpdateState.ReadyToInstall(release, apkFile)
                if (repository.canInstallPackages()) {
                    repository.installApk(apkFile)
                }
            }.onFailure { err ->
                if (err is kotlinx.coroutines.CancellationException) {
                    _updateState.value = UpdateState.Available(release)
                } else {
                    _updateState.value = UpdateState.Error(release, err.userMessage())
                }
            }
        }
    }

    fun cancelUpdateDownload() {
        downloadJob?.cancel()
        downloadJob = null
        val curRelease = _availableUpdate.value
        if (curRelease != null) {
            _updateState.value = UpdateState.Available(curRelease)
        } else {
            _updateState.value = UpdateState.Idle
        }
    }

    fun checkInstalledVersionOnResume() {
        val curRelease = _availableUpdate.value ?: return
        if (BuildConfig.VERSION_CODE >= curRelease.versionCode) {
            _availableUpdate.value = null
            _updateState.value = UpdateState.Idle
            updateDismissedInSession = false
        }
    }

    fun installDownloadedUpdate(apkFile: java.io.File) {
        if (repository.canInstallPackages()) {
            repository.installApk(apkFile)
        } else {
            repository.openInstallPermissionSettings()
        }
    }

    fun login(email: String, password: String, mfaCode:String?) = viewModelScope.launch { _error.value = null; _state.value = SessionState.Loading; runCatching { repository.login(email, password, mfaCode) }.onSuccess { _state.value = SessionState.SignedIn(it) }.onFailure { _error.value = it.userMessage(); _state.value = SessionState.SignedOut } }
    fun logout() = viewModelScope.launch { repository.logout(); _state.value = SessionState.SignedOut }
    fun forgotPassword(email:String)=viewModelScope.launch{runCatching{repository.forgotPassword(email)}.onSuccess{_recoveryMessage.value="If the account exists, a password-reset email has been queued."}.onFailure{_recoveryMessage.value=it.userMessage()}}
    fun activateAccount(token:String,password:String)=viewModelScope.launch{runCatching{repository.activateAccount(token,password)}.onSuccess{_recoveryMessage.value="Account activated. You can sign in now."}.onFailure{_recoveryMessage.value=it.userMessage()}}
    fun resetPassword(token:String,password:String)=viewModelScope.launch{runCatching{repository.resetPassword(token,password)}.onSuccess{_recoveryMessage.value="Password reset completed. You can sign in now."}.onFailure{_recoveryMessage.value=it.userMessage()}}
    fun clearRecoveryMessage(){_recoveryMessage.value=null}
}

internal fun shouldOfferUpdate(
    installedVersionCode: Int,
    latestVersionCode: Int,
    minSupportedVersionCode: Int? = null
): Boolean {
    if (installedVersionCode <= 0 || latestVersionCode <= 0) return false
    return latestVersionCode > installedVersionCode
}

internal fun isUpdateMandatory(
    installedVersionCode: Int,
    minSupportedVersionCode: Int?
): Boolean {
    if (minSupportedVersionCode == null) return false
    return installedVersionCode < minSupportedVersionCode
}

internal fun validatePackageName(archivePackageName: String?, expectedPackageName: String): Boolean {
    if (archivePackageName.isNullOrBlank() || expectedPackageName.isBlank()) return false
    return archivePackageName == expectedPackageName
}

internal fun validateVersionCode(
    archiveVersionCode: Long,
    expectedVersionCode: Int,
    installedVersionCode: Int
): Boolean {
    if (archiveVersionCode <= 0 || expectedVersionCode <= 0) return false
    if (archiveVersionCode != expectedVersionCode.toLong()) return false
    return archiveVersionCode > installedVersionCode.toLong()
}

internal fun validateSha256(computedHash: String, expectedHash: String?): Boolean {
    if (computedHash.isBlank() || expectedHash.isNullOrBlank()) return false
    val cleanComputed = computedHash.trim().lowercase()
    val cleanExpected = expectedHash.trim().lowercase()
    if (cleanComputed.length != 64 || cleanExpected.length != 64) return false
    return cleanComputed == cleanExpected
}

internal fun matchCertificateBytes(
    archiveCertBytes: List<ByteArray>,
    installedCertBytes: List<ByteArray>
): Boolean {
    if (archiveCertBytes.isEmpty() || installedCertBytes.isEmpty()) return false
    return archiveCertBytes.any { a ->
        installedCertBytes.any { i -> java.util.Arrays.equals(a, i) }
    }
}
