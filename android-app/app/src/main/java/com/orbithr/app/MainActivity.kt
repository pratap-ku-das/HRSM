package com.orbithr.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.orbithr.app.ui.OrbitTheme
import com.orbithr.app.ui.RootApp
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); enableEdgeToEdge(); setContent { OrbitTheme { val vm: MainViewModel = hiltViewModel(); val state by vm.state.collectAsState(); val error by vm.error.collectAsState(); RootApp(state, error, vm::login, vm::logout) } } }
}
