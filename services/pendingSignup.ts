// services/pendingSignup.ts
//
// Holds the signup password in memory only while the email-OTP step is
// completed. It is deliberately NOT persisted to sessionStorage/localStorage,
// so it never sits in browser storage. Client-side navigation between
// /auth and /verify keeps this module alive; a full page reload clears it.

let pendingPassword = "";

export const setPendingPassword = (value: string) => {
  pendingPassword = value;
};

export const getPendingPassword = () => pendingPassword;

export const clearPendingPassword = () => {
  pendingPassword = "";
};
