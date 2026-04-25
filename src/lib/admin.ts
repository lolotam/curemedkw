const KEY = "curemed.admin.session";
export const ADMIN_PASSWORD = "curemed-admin"; // change here to set a new admin password

export const adminAuth = {
  isLoggedIn: () => sessionStorage.getItem(KEY) === "1",
  login: (password: string) => {
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(KEY, "1");
      return true;
    }
    return false;
  },
  logout: () => sessionStorage.removeItem(KEY),
};