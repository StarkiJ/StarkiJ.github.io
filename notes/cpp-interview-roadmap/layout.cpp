#include <cstddef>
#include <iostream>
#include <type_traits>
struct S { char c; int i; short s; };
#pragma pack(push, 1)
struct Packed { char c; int i; short s; };
#pragma pack(pop)
int main() {
    static_assert(std::is_standard_layout_v<S>);
    static_assert(std::is_standard_layout_v<Packed>);
    std::cout << sizeof(void*) << '\n';
    std::cout << sizeof(S) << ' ' << alignof(S) << ' '
              << offsetof(S,c) << ' ' << offsetof(S,i) << ' '
              << offsetof(S,s) << '\n';
    std::cout << sizeof(Packed) << ' ' << alignof(Packed) << ' '
              << offsetof(Packed,c) << ' ' << offsetof(Packed,i) << ' '
              << offsetof(Packed,s) << '\n';
}
