#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Player,
    Admin,
}

pub struct User {
    pub id: u64,
    pub name: String,
    pub role: Role,
    /// Nur den Hash speichern (z. B. Argon2), nie das Passwort selbst.
    pub password_hash: String,
}