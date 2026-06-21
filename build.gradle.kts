import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar

plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.serialization") version "2.4.0"
    id("com.gradleup.shadow") version "9.4.2"
    id("xyz.jpenilla.run-paper") version "3.0.2"
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

val ktorVersion = "3.1.3"
val kotlinxSerializationVersion = "1.8.1"
val kotlinxCoroutinesVersion = "1.10.2"
val jlineVersion = "3.26.3"
val logbackVersion = "1.5.18"

dependencies {
    // Paper API — provided by the server at runtime in plugin mode
    compileOnly("io.papermc.paper:paper-api:1.21-R0.1-SNAPSHOT")

    // Kotlin stdlib
    implementation(kotlin("stdlib"))
    implementation(kotlin("reflect"))

    // Kotlinx
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$kotlinxCoroutinesVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:$kotlinxSerializationVersion")

    // Ktor Server (plugin mode)
    implementation("io.ktor:ktor-server-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-netty-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-websockets-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jwt-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-cors-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging-jvm:$ktorVersion")

    // Ktor Client (standalone mode)
    implementation("io.ktor:ktor-client-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-client-cio-jvm:$ktorVersion")
    implementation("io.ktor:ktor-client-websockets-jvm:$ktorVersion")
    implementation("io.ktor:ktor-client-content-negotiation-jvm:$ktorVersion")

    // JLine 3 (standalone terminal)
    implementation("org.jline:jline-terminal:$jlineVersion")
    implementation("org.jline:jline-reader:$jlineVersion")
    implementation("org.jline:jline-terminal-jansi:$jlineVersion")

    // JWT issuance (Auth0 library; Ktor's auth-jwt uses same HMAC256 algorithm for validation)
    implementation("com.auth0:java-jwt:4.5.0")

    // Logging (Ktor needs SLF4J; Logback satisfies it)
    implementation("ch.qos.logback:logback-classic:$logbackVersion")

    // Log4j API — Paper provides it at runtime; compileOnly to attach the console appender
    compileOnly("org.apache.logging.log4j:log4j-api:2.22.0")
    compileOnly("org.apache.logging.log4j:log4j-core:2.22.0")
}

kotlin {
    jvmToolchain(21)
}

tasks {
    build {
        dependsOn(shadowJar)
    }

    val buildFrontend by registering(Exec::class) {
        workingDir("frontend")
        commandLine("npm", "run", "build")
        inputs.dir("frontend/src")
        inputs.file("frontend/package.json")
        outputs.dir("src/main/resources/webroot")
    }

    shadowJar {
        archiveClassifier.set("")

        manifest {
            attributes(
                "Main-Class" to "io.github.Earth1283.teletype.standalone.StandaloneMainKt",
                "Multi-Release" to "true"
            )
        }

        // Relocate everything that Paper also ships to avoid classloader conflicts.
        // DO NOT relocate org.apache.logging — Paper provides Log4j at runtime.
        // DO NOT relocate io.github.Earth1283 — this plugin's own package.
        relocate("kotlin.", "teletype.shaded.kotlin.")
        relocate("kotlinx.", "teletype.shaded.kotlinx.")
        relocate("io.ktor.", "teletype.shaded.ktor.")
        relocate("io.netty.", "teletype.shaded.netty.")
        relocate("com.nimbusds.", "teletype.shaded.nimbusds.")
        relocate("net.minidev.", "teletype.shaded.minidev.")
        relocate("org.slf4j.", "teletype.shaded.slf4j.")
        relocate("ch.qos.logback.", "teletype.shaded.logback.")
        relocate("org.jline.", "teletype.shaded.jline.")
        relocate("org.jetbrains.annotations.", "teletype.shaded.jetbrains.annotations.")
        relocate("com.auth0.", "teletype.shaded.auth0.")
        relocate("com.typesafe.", "teletype.shaded.typesafe.")

        // Merge SPI service descriptors — required for Ktor's Netty engine and serialization
        mergeServiceFiles()
    }

    runServer {
        minecraftVersion("1.21")
        jvmArgs("-Xms2G", "-Xmx2G", "-Dcom.mojang.eula.agree=true")
    }

    processResources {
        val props = mapOf("version" to version)
        filesMatching("plugin.yml") {
            expand(props)
        }
    }
}
