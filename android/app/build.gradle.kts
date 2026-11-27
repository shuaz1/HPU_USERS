plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cn.hpu.suishouce"
    compileSdk = 34

    defaultConfig {
        applicationId = "cn.hpu.suishouce"
        minSdk = 21
        targetSdk = 34
        versionCode = (project.findProperty("versionCode") as String).toInt()
        versionName = project.findProperty("versionName") as String
    }

    // 自签钥匙：把 keytool 生成的 hpu-release.jks 放到 app/ 目录即可自动启用；
    // 没有就用 debug 签名，装得上、能自用（换签名要卸载重装）
    signingConfigs {
        create("release") {
            val ks = file("hpu-release.jks")
            if (ks.exists()) {
                storeFile = ks
                storePassword = System.getenv("HPU_KS_PASS") ?: "hpu123456"
                keyAlias = System.getenv("HPU_KS_ALIAS") ?: "hpu"
                keyPassword = System.getenv("HPU_KEY_PASS") ?: "hpu123456"
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = if (file("hpu-release.jks").exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
        getByName("debug") {
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}
