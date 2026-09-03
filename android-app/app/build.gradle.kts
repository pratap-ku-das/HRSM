import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.orbithr.app"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.orbithr.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"${providers.gradleProperty("ORBIT_API_BASE_URL").orElse("http://10.0.2.2:3001/api/v1/").get()}\"")
    }
    signingConfigs {
        create("release") {
            val keystorePropsFile = rootProject.file("keystore.properties")
            val localPropsFile = rootProject.file("local.properties")
            val props = Properties()
            if (keystorePropsFile.exists()) {
                keystorePropsFile.inputStream().buffered().use { props.load(it) }
            } else if (localPropsFile.exists()) {
                localPropsFile.inputStream().buffered().use { props.load(it) }
            }

            val storeFilePath = props.getProperty("RELEASE_STORE_FILE")
                ?: providers.gradleProperty("RELEASE_STORE_FILE").orNull
                ?: "../orbithr-release.jks"
            val storePass = props.getProperty("RELEASE_STORE_PASSWORD")
                ?: providers.gradleProperty("RELEASE_STORE_PASSWORD").orNull
            val keyAliasName = props.getProperty("RELEASE_KEY_ALIAS")
                ?: providers.gradleProperty("RELEASE_KEY_ALIAS").orNull
                ?: "orbithr"
            val keyPass = props.getProperty("RELEASE_KEY_PASSWORD")
                ?: providers.gradleProperty("RELEASE_KEY_PASSWORD").orNull

            if (storePass != null && keyPass != null && file(storeFilePath).exists()) {
                storeFile = file(storeFilePath)
                storePassword = storePass
                keyAlias = keyAliasName
                keyPassword = keyPass
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}") }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.viewmodel)
    implementation(libs.androidx.hilt.work)
    ksp(libs.hilt.compiler)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.datastore)
    implementation(libs.work.runtime)
    implementation(libs.coil.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.mockwebserver)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
