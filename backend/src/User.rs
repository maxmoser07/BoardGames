pub struct User{
    id: i8,
    name: String,
    role: Role,
    password: String,
}
enum Role {
    Player,
    Admin
}