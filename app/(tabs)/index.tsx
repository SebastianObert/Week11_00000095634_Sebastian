import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";
import { supabase } from "../../utils/supabase";

type Coordinates = {
  latitude: number;
  longitude: number;
};

const { height } = Dimensions.get("window");

export default function Index() {
  const [image, setImage] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(false);

  // Mengambil lokasi otomatis saat aplikasi pertama kali dimuat
  useEffect(() => {
    getLocation();
  }, []);

  // LOGIKA LOKASI & PETA
  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Izin Ditolak",
        "Aplikasi butuh akses lokasi untuk fitur peta.",
      );
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
  };

  const handleMapPress = (e: any) => {
    setLocation(e.nativeEvent.coordinate); // Memperbarui via Tap
  };

  const handleMarkerDragEnd = (e: any) => {
    setLocation(e.nativeEvent.coordinate); // Memperbarui via Drag
  };

  // LOGIKA KAMERA, GALERI & PENYIMPANAN LOKAL
  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Izin Ditolak", "Aplikasi butuh akses kamera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const openGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Izin Ditolak", "Aplikasi butuh akses galeri.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const saveToLocalGallery = async () => {
    if (!image) {
      Alert.alert("Validasi Gagal", "Tidak ada foto untuk disimpan.");
      return;
    }
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted)
        throw new Error("Izin akses galeri tidak diberikan.");

      await MediaLibrary.saveToLibraryAsync(image);
      Alert.alert(
        "Sukses",
        "Gambar berhasil disimpan ke dalam Galeri perangkat.",
      );
    } catch (error: any) {
      Alert.alert("Gagal Menyimpan", error.message);
    }
  };

  // LOGIKA INTEGRASI SUPABASE
  const uploadToSupabase = async () => {
    if (!image || !location) {
      Alert.alert(
        "Validasi Gagal",
        "Pastikan foto dan koordinat lokasi sudah tersedia sebelum mengunggah.",
      );
      return;
    }

    try {
      setLoading(true);

      // 1. Konversi ke Base64
      const base64 = await FileSystem.readAsStringAsync(image, {
        encoding: "base64",
      });
      const fileName = `photo-${Date.now()}.jpeg`;

      // 2. Upload ke Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("camera")
        .upload(fileName, decode(base64), { contentType: "image/jpeg" });

      if (storageError)
        throw new Error(`Storage Error: ${storageError.message}`);

      // 3. Ambil Public URL
      const { data: publicUrlData } = supabase.storage
        .from("camera")
        .getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      // 4. Insert Data ke Tabel PostgreSQL
      const { error: dbError } = await supabase.from("photo").insert([
        {
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          image_url: publicUrl,
        },
      ]);

      if (dbError) throw new Error(`Database Error: ${dbError.message}`);

      Alert.alert(
        "Operasi Berhasil",
        "Data gambar dan geolokasi telah sinkron dengan Supabase.",
      );
    } catch (error: any) {
      Alert.alert("Interupsi Sistem", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Kalkulasi area pandang peta
  const region = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Peta (Modul 10) */}
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            style={styles.map}
            initialRegion={region}
            onPress={handleMapPress}
          >
            <UrlTile urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker
              draggable
              coordinate={location}
              onDragEnd={handleMarkerDragEnd}
              title="Posisi Tangkapan"
            />
          </MapView>
        ) : (
          <View style={[styles.map, styles.center]}>
            <ActivityIndicator size="large" color="#1f2937" />
            <Text>Mencari satelit GPS...</Text>
          </View>
        )}
      </View>

      {/* Info Koordinat (Modul 10) */}
      <View style={styles.infoBlock}>
        <Text style={styles.infoText}>
          Lat: {location?.latitude.toFixed(6) || "Memuat..."}
        </Text>
        <Text style={styles.infoText}>
          Lon: {location?.longitude.toFixed(6) || "Memuat..."}
        </Text>
        <Text style={styles.hintText}>
          (Tap atau Drag marker untuk mengubah posisi)
        </Text>
      </View>

      {/* Pratinjau Gambar (Modul 9) */}
      {image ? (
        <Image source={{ uri: image }} style={styles.imagePreview} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={{ color: "#9ca3af" }}>Belum ada foto yang dipilih</Text>
        </View>
      )}

      {/* Panel Kontrol Eksekusi */}
      <View style={styles.controlPanel}>
        <View style={styles.row}>
          <Button title="Buka Kamera" onPress={openCamera} />
          <Button title="Buka Galeri" onPress={openGallery} />
        </View>

        <View style={styles.actionButtons}>
          <Button
            title="Simpan ke Perangkat Lokal"
            onPress={saveToLocalGallery}
            color="#10b981"
          />
        </View>

        <View style={styles.actionButtons}>
          {loading ? (
            <ActivityIndicator size="large" color="#3b82f6" />
          ) : (
            <Button
              title="Unggah Data ke Supabase"
              onPress={uploadToSupabase}
              color="#3b82f6"
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  content: {
    padding: 16,
    alignItems: "center",
    paddingBottom: 40,
  },
  mapContainer: {
    width: "100%",
    height: height * 0.4,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e5e7eb",
  },
  infoBlock: {
    width: "100%",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  hintText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  imagePreview: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    marginBottom: 16,
  },
  imagePlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  controlPanel: {
    width: "100%",
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 8,
  },
  actionButtons: {
    width: "100%",
    marginVertical: 4,
  },
});
