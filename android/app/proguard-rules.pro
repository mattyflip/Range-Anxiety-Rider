# Firebase
-keep class com.google.firebase.** { *; }
-keepclassmembers class com.google.firebase.** { *; }

# Stripe
-keep class com.stripe.** { *; }
-dontwarn com.stripe.**

# React Native / Capacitor
-keep class com.facebook.react.** { *; }
-keep class org.reactnative.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Keep API endpoints (obfuscate but don't remove)
-keep class com.ebikeking.rangeanxiety.** { *; }

# Keep data models
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
