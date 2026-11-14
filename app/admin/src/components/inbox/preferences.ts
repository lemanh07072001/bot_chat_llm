export const DEFAULT_CANNED_RESPONSES = [
  "Xin chào quý khách, em có thể hỗ trợ gì cho mình ạ? 👋",
  "Dạ bên em đã tiếp nhận thông tin, xin quý khách đợi trong giây lát ạ! ⏳",
  "Dạ vấn đề đã được giải quyết rồi ạ. Quý khách cần hỗ trợ thêm gì không ạ? ✨",
  "Cảm ơn quý khách đã liên hệ với Chat Center. Chúc quý khách một ngày tốt lành! 🙏",
];

export type AccountPreferences = { soundEnabled: boolean; cannedResponses?: string[] };

export function announcePreferences(preferences: AccountPreferences) {
  window.dispatchEvent(new CustomEvent("account-preferences", { detail: preferences }));
}
