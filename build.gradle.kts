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
val logbackVersion = "1.5.18"

// kotlin-reflect leaks in transitively via ktor-server-core-jvm but is never used
// (code only does ::class.java, no KClass/reflection APIs) — drop it from the app's
// own classpaths. Scoped by name (not configurations.all) so the Kotlin compiler's
// own internal classpaths — which genuinely need kotlin-reflect — are untouched.
configurations.matching { it.name in setOf("compileClasspath", "runtimeClasspath", "testCompileClasspath", "testRuntimeClasspath") }.configureEach {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-reflect")
}

dependencies {
    // Paper API — provided by the server at runtime in plugin mode
    compileOnly("io.papermc.paper:paper-api:1.21-R0.1-SNAPSHOT")

    // Kotlin stdlib
    implementation(kotlin("stdlib"))

    // Kotlinx
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$kotlinxCoroutinesVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:$kotlinxSerializationVersion")

    // Ktor Server (plugin mode)
    implementation("io.ktor:ktor-server-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-netty-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-websockets-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jvm:$ktorVersion")
    // Do NOT exclude com.auth0:jwks-rsa here even though this project only signs/validates
    // HMAC256 (see java-jwt below). Ktor compiles every top-level function in its JWTUtils.kt
    // into one JWTUtilsKt class file; that class also holds a JWK-based algorithm helper whose
    // catch block references com.auth0.jwk.JwkException. JVM class verification resolves every
    // exception-table type for the whole class at link time, so the first JWT check — even a
    // pure-HMAC one — loads JWTUtilsKt and throws NoClassDefFoundError for the missing class if
    // jwks-rsa isn't on the classpath.
    implementation("io.ktor:ktor-server-auth-jwt-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-compression-jvm:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-cors-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-forwarded-header-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-rate-limit-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-http-redirect-jvm:$ktorVersion")
    implementation("io.ktor:ktor-network-tls-certificates-jvm:$ktorVersion")

    // JWT issuance (Auth0 library; Ktor's auth-jwt uses same HMAC256 algorithm for validation)
    implementation("com.auth0:java-jwt:4.5.0")

    // SQLite — metrics time-series persistence
    // Not relocated: Paper 1.21 doesn't expose org.xerial/org.sqlite to plugin classloader,
    // and sqlite-jdbc's native-lib extraction breaks if the class path is changed.
    implementation("org.xerial:sqlite-jdbc:3.47.1.0")

    // Archive decompression — tar.gz/tgz support for the file manager (ZIP uses the JDK's own java.util.zip)
    implementation("org.apache.commons:commons-compress:1.27.1")

    // Logging (Ktor needs SLF4J; Logback satisfies it)
    implementation("ch.qos.logback:logback-classic:$logbackVersion")

    // Log4j API — Paper provides it at runtime; compileOnly to attach the console appender
    compileOnly("org.apache.logging.log4j:log4j-api:2.22.0")
    compileOnly("org.apache.logging.log4j:log4j-core:2.22.0")

    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.12.2")
}

kotlin {
    jvmToolchain(21)
}

tasks {
    build {
        dependsOn(shadowJar)
    }

    val npmInstall by registering(Exec::class) {
        workingDir("frontend")
        commandLine("npm", "install", "--prefer-offline")
        inputs.file("frontend/package.json")
        inputs.file("frontend/package-lock.json")
        // Use the lock file npm writes after install as a marker — avoids hashing all of node_modules
        outputs.file("frontend/node_modules/.package-lock.json")
        outputs.cacheIf { true }
    }

    val buildFrontend by registering(Exec::class) {
        dependsOn(npmInstall)
        workingDir("frontend")
        commandLine("npm", "run", "build")
        inputs.dir("frontend/src")
        inputs.file("frontend/package.json")
        outputs.dir("src/main/resources/webroot")
        outputs.cacheIf { true }
    }

    shadowJar {
        dependsOn(buildFrontend)
        archiveClassifier.set("")

        // sqlite-jdbc bundles natives for every OS; this server only ever runs on
        // Linux, Linux-Musl (Alpine), Mac, or Windows — drop Android and FreeBSD.
        exclude("org/sqlite/native/Linux-Android/**")
        exclude("org/sqlite/native/FreeBSD/**")

        manifest {
            attributes(
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
        relocate("org.jetbrains.annotations.", "teletype.shaded.jetbrains.annotations.")
        relocate("com.auth0.", "teletype.shaded.auth0.")
        relocate("com.typesafe.", "teletype.shaded.typesafe.")
        relocate("org.bouncycastle.", "teletype.shaded.bouncycastle.")
        relocate("org.apache.commons.compress.", "teletype.shaded.commonscompress.")

        // Merge SPI service descriptors — required for Ktor's Netty engine and serialization
        mergeServiceFiles()
    }

    runServer {
        minecraftVersion("1.21")
        jvmArgs("-Xms2G", "-Xmx2G", "-Dcom.mojang.eula.agree=true")
    }

    test {
        useJUnitPlatform()
    }

    processResources {
        dependsOn(buildFrontend)
        val props = mapOf("version" to version)
        filesMatching("plugin.yml") {
            expand(props)
        }
    }
}
