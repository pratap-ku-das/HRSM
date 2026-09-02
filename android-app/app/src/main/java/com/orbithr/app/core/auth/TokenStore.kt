package com.orbithr.app.core.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authDataStore by preferencesDataStore("secure_auth")

@Singleton class TokenStore @Inject constructor(@ApplicationContext private val context: Context) {
    @Volatile private var accessToken: String? = null
    private val refreshKey = stringPreferencesKey("refresh_ciphertext")
    private val alias = "orbithr_refresh_token"

    fun access(): String? = accessToken
    fun setAccess(value: String?) { accessToken = value }

    suspend fun refresh(): String? = context.authDataStore.data.first()[refreshKey]?.let(::decrypt)
    suspend fun save(access: String, refresh: String) { accessToken = access; context.authDataStore.edit { it[refreshKey] = encrypt(refresh) } }
    suspend fun clear() { accessToken = null; context.authDataStore.edit { it.remove(refreshKey) } }

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun encrypt(value: String): String { val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey()); return android.util.Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), android.util.Base64.NO_WRAP) }
    private fun decrypt(value: String): String? = runCatching { val bytes = android.util.Base64.decode(value, android.util.Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))); String(cipher.doFinal(bytes.copyOfRange(12, bytes.size))) }.getOrNull()
}
