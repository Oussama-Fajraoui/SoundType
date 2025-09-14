import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  SafeAreaView,
  ScrollView,
  View,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,        
} from "react-native";
import { Audio } from "expo-av";
import { transcribeSpeech } from "@/functions/transcribeSpeech";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { recordSpeech } from "@/functions/recordSpeech";
import useWebFocus from "@/hooks/useWebFocus";

export default function HomeScreen() {
  const [primaryLang, setPrimaryLang] = useState("en-US");
  const [altLangsCsv, setAltLangsCsv] = useState("fr-FR,de-DE,ar-SA");
  const [transcribedSpeech, setTranscribedSpeech] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const isWebFocused = useWebFocus();
  const audioRecordingRef = useRef(new Audio.Recording());
  const webAudioPermissionsRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isWebFocused) {
      const getMicAccess = async () => {
        const permissions = await navigator.mediaDevices.getUserMedia({ audio: true });
        webAudioPermissionsRef.current = permissions;
      };
      if (!webAudioPermissionsRef.current) getMicAccess();
    } else {
      if (webAudioPermissionsRef.current) {
        webAudioPermissionsRef.current.getTracks().forEach((track) => track.stop());
        webAudioPermissionsRef.current = null;
      }
    }
  }, [isWebFocused]);

  const startRecording = async () => {
    setIsRecording(true);
    await recordSpeech(
      audioRecordingRef,
      setIsRecording,
      !!webAudioPermissionsRef.current
    );
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setIsTranscribing(true);
    try {
      const alts = altLangsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3); 

      const speechTranscript = await transcribeSpeech(audioRecordingRef, {
        languageCode: primaryLang,
        alternativeLanguageCodes: alts,
      });

      setTranscribedSpeech(speechTranscript || "");
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <SafeAreaView>
      <ScrollView style={styles.mainScrollContainer}>
        <View style={styles.mainInnerContainer}>
          <Text style={styles.title}>Speech-to-Text App</Text>

          {/* NEW: simple inputs to choose languages */}
          <View style={{ width: "100%", gap: 10 }}>
            <Text>Primary language (BCP-47, e.g. en-US, fr-FR):</Text>
            <TextInput
              value={primaryLang}
              onChangeText={setPrimaryLang}
              placeholder="e.g. en-US"
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text>Alternative languages (comma-separated, max 3):</Text>
            <TextInput
              value={altLangsCsv}
              onChangeText={setAltLangsCsv}
              placeholder="e.g. fr-FR,de-DE,ar-SA"
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.transcriptionContainer}>
            {isTranscribing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text
                style={{
                  ...styles.transcribedText,
                  color: transcribedSpeech ? "#000" : "rgb(150,150,150)",
                }}
              >
                {transcribedSpeech || "Your transcribed text will be shown here"}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={{
              ...styles.microphoneButton,
              opacity: isRecording || isTranscribing ? 0.5 : 1,
            }}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={isRecording || isTranscribing}
          >
            {isRecording ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <FontAwesome name="microphone" size={40} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainScrollContainer: {
    padding: 20,
    height: "100%",
    width: "100%",
  },
  mainInnerContainer: {
    gap: 25,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    padding: 5,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
  },
  transcriptionContainer: {
    backgroundColor: "rgb(220,220,220)",
    width: "100%",
    minHeight: 180,
    padding: 20,
    marginTop: 10,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  transcribedText: {
    fontSize: 18,
    padding: 5,
    color: "#000",
    textAlign: "left",
    width: "100%",
  },
  microphoneButton: {
    backgroundColor: "red",
    width: 75,
    height: 75,
    marginTop: 24,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
});
