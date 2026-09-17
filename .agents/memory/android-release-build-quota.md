---
name: Android release build quota
description: Constraints and safe cleanup strategy for producing signed Expo Android bundles in this workspace.
---

For Android release builds in this workspace, Gradle artifact transforms can accumulate failed or duplicate outputs and exhaust the storage quota before packaging. A clean transform cache is safe to rebuild; keep downloaded dependency artifacts and the Android signing files. When `/tmp` is quota-limited, place the temporary SDK and Gradle caches under the workspace and remove them after copying the AAB.

**Why:** Repeated failed Gradle attempts left incomplete transform directories, while the project also carried a large Android SDK and pnpm caches. The Nix Java 17 runtime required by Kotlin can build successfully when launched with `JAVA_TOOL_OPTIONS=-XX:-UsePerfData`; using Java 21 alone does not satisfy the Android/Kotlin toolchain.

**How to apply:** Build the Play release as `arm64-v8a` when appropriate, keep the compiler/linker/sysroot components required by native modules, run Gradle with Java 17 plus `-XX:-UsePerfData`, and clear stale Gradle transforms before retrying rather than deleting source files or keystores.

**Compatibility check:** Compare the ABI directories in the actual Play baseline AAB, not only the same-key predecessor; a manifest can be identical while dropping `armeabi-v7a`, `x86`, or `x86_64` removes devices.

**SDK recovery:** If the temporary Android SDK is gone, the local Nix store may provide the exact platform, build-tools, NDK, and CMake archives needed to reconstruct it outside `/tmp`; Gradle may require more than the app's declared build-tools version.

**Why:** The release build needed both Build Tools 35.0.0 for an Expo module and CMake 3.22.1 for native modules, in addition to the app's Platform 36, Build Tools 36.0.0, and NDK r27b requirements.

**How to apply:** Recreate only the required SDK package directories under a workspace-local temporary path, run the release build, copy and verify the AAB, then remove the temporary SDK and Gradle cache.

**Low-memory recovery:** If the Gradle daemon disappears during multi-ABI native compilation, rerun with one Gradle worker, `org.gradle.parallel=false`, and `CMAKE_BUILD_PARALLEL_LEVEL=1`.

**Why:** The same signed release completed with serialized native compilation after a parallel run was killed during CMake work; this changes build scheduling only, not the produced app behavior.

**How to apply:** Keep the four requested ABIs, serialize the retry, and verify the final bundle rather than treating the pre-existing AAB as the result.