import { MutableRefObject } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Device from "expo-device";
import { Audio } from "expo-av";                 
import { readBlobAsBase64 } from "./readBlobAsBase64";

type STTOptions = {
  languageCode?: string;               // primary language, e.g. "en-US"
  alternativeLanguageCodes?: string[]; // up to 3 alternatives, e.g. ["fr-FR","de-DE","ar-SA"]
};

export const transcribeSpeech = async (
  audioRecordingRef: MutableRefObject<Audio.Recording>,
  opts?: STTOptions
) => {
  const primary = opts?.languageCode ?? "en-US";
  const alts = (opts?.alternativeLanguageCodes ?? ["fr-FR", "de-DE", "ar-SA"]).slice(0, 3);

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });

    try {
      await audioRecordingRef.current.stopAndUnloadAsync();
    } catch {
      // already stopped}
    }             
    const recordingUri = audioRecordingRef.current.getURI?.() || "";
    if (!recordingUri) {
      console.error("No recording URI available");
      return undefined;
    }

    let base64Audio = "";
    if (Platform.OS === "web") {
      const blob = await fetch(recordingUri).then((res) => res.blob());
      const dataUrl = (await readBlobAsBase64(blob)) as string; 
      base64Audio = dataUrl.split("base64,")[1] ?? "";         
    } else {
      base64Audio = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    if (!base64Audio) {
      console.error("Failed to read audio as base64");
      return undefined;
    }

    // Reset ref for next recording
    audioRecordingRef.current = new Audio.Recording();

    const audioConfig = {
      encoding:
        Platform.OS === "android"
          ? "AMR_WB"
          : Platform.OS === "web"
          ? "WEBM_OPUS"
          : "LINEAR16",
      sampleRateHertz:
        Platform.OS === "android"
          ? 16000
          : Platform.OS === "web"
          ? 48000
          : 44100, // ✅ fix typo: 44100 (not 41000)
      languageCode: primary,
      ...(alts.length ? { alternativeLanguageCodes: alts } : {}),
      enableAutomaticPunctuation: true,
    };

    // ---- Choose server origin (emulator vs real device vs simulator) ----
    // Android emulator -> 10.0.2.2 ; real devices -> use your LAN IP via env
    const isEmulator = !Device.isDevice;
    const rootOrigin =
      Platform.OS === "android" && isEmulator
        ? "10.0.2.2"
        : Device.isDevice
        ? process.env.LOCAL_DEV_IP || "localhost" // set LOCAL_DEV_IP=192.168.x.x for real phone testing
        : "localhost";

    const serverUrl = `http://${rootOrigin}:4000/speech-to-text`;

    const res = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioUrl: base64Audio,
        config: audioConfig,
      }),
    });

    if (!res.ok) {
      const msg = `STT HTTP ${res.status}`;
      console.error(msg);
      return undefined;
    }

    const serverResponse = await res.json();

    const results = serverResponse?.results;
    if (results?.length) {
      const transcript =
        results
          .map((r: any) => r?.alternatives?.[0]?.transcript)
          .filter(Boolean)
          .join(" ")
          .trim() || "";
      return transcript || undefined;
    }

    if (typeof serverResponse?.text === "string") {
      return serverResponse.text || undefined;
    }

    console.error("No transcript found in server response");
    return undefined;
  } catch (e) {
    console.error("Failed to transcribe speech!", e);
    return undefined;
  }
};