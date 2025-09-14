import { MutableRefObject } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Device from "expo-device";
import { Audio } from "expo-av";
import { readBlobAsBase64 } from "./readBlobAsBase64";

type STTOptions = {
  languageCode?: string;
  alternativeLanguageCodes?: string[];
};

export const transcribeSpeech = async (
  audioRecordingRef: MutableRefObject<Audio.Recording>,
  opts?: STTOptions
) => {
  const primary = opts?.languageCode ?? "en-US";
  const alts = (opts?.alternativeLanguageCodes ?? ["fr-FR", "de-DE", "ar-SA"]).slice(0, 3);

  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });

    // ensure stopped
    try { await audioRecordingRef.current.stopAndUnloadAsync(); } catch {}

    const recordingUri = audioRecordingRef.current.getURI?.() || "";
    if (!recordingUri) return undefined;

    // read audio as base64 (Google expects raw base64 in `audio.content`)
    let base64Audio = "";
    if (Platform.OS === "web") {
      const blob = await fetch(recordingUri).then((r) => r.blob());
      const dataUrl = (await readBlobAsBase64(blob)) as string; // "data:...;base64,AAAA"
      base64Audio = dataUrl.split("base64,")[1] ?? "";
    } else {
      base64Audio = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    if (!base64Audio) return undefined;

    // ready for next recording
    audioRecordingRef.current = new Audio.Recording();

    // Google STT config
    const audioConfig = {
      encoding:
        Platform.OS === "android" ? "AMR_WB" :
        Platform.OS === "web"     ? "WEBM_OPUS" :
                                    "LINEAR16",
      sampleRateHertz:
        Platform.OS === "android" ? 16000 :
        Platform.OS === "web"     ? 48000 :
                                    44100,
      languageCode: primary,
      ...(alts.length ? { alternativeLanguageCodes: alts } : {}),
      enableAutomaticPunctuation: true,
    };

    // ---- choose server URL ----
    const PROD_URL = process.env.EXPO_PUBLIC_STT_URL; 
    const serverUrl =
      PROD_URL && PROD_URL.length
        ? PROD_URL
        : (() => {
            const isEmulator = !Device.isDevice;
            const host =
              Platform.OS === "android" && isEmulator
                ? "10.0.2.2"
                : Device.isDevice
                ? (process.env.EXPO_PUBLIC_LOCAL_DEV_IP || "localhost")
                : "localhost";
            return `http://${host}:4000/speech-to-text`;
          })();

    console.log("STT →", serverUrl);

    const res = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioUrl: base64Audio, config: audioConfig }),
    });

    if (!res.ok) {
      console.error("STT HTTP", res.status, await res.text().catch(() => ""));
      return undefined;
    }

    const json = await res.json();

    // { text } or Google results
    if (typeof json?.text === "string") return json.text || undefined;
    const transcript =
      json?.results?.map((r: any) => r?.alternatives?.[0]?.transcript).filter(Boolean).join(" ").trim();
    return transcript || undefined;
  } catch (e) {
    console.error("Failed to transcribe speech!", e);
    return undefined;
  }
};