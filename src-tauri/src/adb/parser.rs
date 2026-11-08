use crate::models::{DeviceInfo, DeviceStatus};

pub fn parse_devices(output: &str) -> Vec<DeviceInfo> {
    output.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("List of devices attached"))
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let serial = parts.next()?.to_string();
            let raw_status = parts.next().unwrap_or("unknown");
            let status = DeviceStatus::from_adb(raw_status);
            let fields = parts.filter_map(|part| part.split_once(':'))
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect::<std::collections::HashMap<_, _>>();
            let model = fields.get("model").map(|s| s.replace('_', " "));
            let product = fields.get("product").cloned();
            let connection_type = if serial.contains(':') { "wireless" } else { "usb" }.to_string();
            Some(DeviceInfo {
                serial,
                status,
                connection_type,
                model,
                product,
                android_version: None,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiple_device_states_and_connection_types() {
        let sample = "List of devices attached\nR58M123456A device product:diamond model:Redmi_Note_13_Pro transport_id:1\n192.168.1.22:37211 device product:lynx model:Pixel_7 transport_id:2\nABCD unauthorized usb:1-1\nZXCV offline\n";
        let devices = parse_devices(sample);
        assert_eq!(devices.len(), 4);
        assert_eq!(devices[0].model.as_deref(), Some("Redmi Note 13 Pro"));
        assert_eq!(devices[0].connection_type, "usb");
        assert_eq!(devices[1].connection_type, "wireless");
        assert_eq!(devices[2].status, DeviceStatus::Unauthorized);
        assert_eq!(devices[3].status, DeviceStatus::Offline);
    }
}
