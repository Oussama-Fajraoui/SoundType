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
    try { await audioRecordingRef.current.stopAndUnloadAsync(); } catch {}

    const recordingUri = audioRecordingRef.current.getURI?.() || "";
    if (!recordingUri) throw new Error("No recording URI available");

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
    if (!base64Audio) throw new Error("Failed to read audio as base64");

    // ready for next recording
    audioRecordingRef.current = new Audio.Recording();

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

    // ---- use Render URL; if missing, FAIL (don’t silently call localhost) ----
    const PROD_URL = process.env.EXPO_PUBLIC_STT_URL;
    if (!PROD_URL) {
      throw new Error(
        "EXPO_PUBLIC_STT_URL is not set in this build. Add it to eas.json (env) or EAS dashboard."
      );
    }
    const serverUrl = PROD_URL; // e.g. https://soundtype-api.onrender.com/speech-to-text
    console.log("STT →", serverUrl);

    // ---- add a timeout so the spinner doesn't hang forever ----
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000); // 10s
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioUrl: base64Audio, config: audioConfig }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`STT HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (typeof json?.text === "string") return json.text || undefined;
    const transcript =
      json?.results?.map((r: any) => r?.alternatives?.[0]?.transcript).filter(Boolean).join(" ").trim();
    return transcript || undefined;
  } catch (e: any) {
    console.error("Failed to transcribe speech!", e);
    // surface a friendly error to your UI if you want:
    return undefined;
  }
};
