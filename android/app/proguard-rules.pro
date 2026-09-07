# Capacitor / WebView bridge must keep its JavascriptInterface members.
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * { @com.getcapacitor.annotation.PluginMethod <methods>; }
-keep class studio.stuubzzz.scrappybird.** { *; }
# Strip logging from release builds.
-assumenosideeffects class android.util.Log { public static *** d(...); public static *** v(...); public static *** i(...); }
-renamesourcefileattribute SourceFile
