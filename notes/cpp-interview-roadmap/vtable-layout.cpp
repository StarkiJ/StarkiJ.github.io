#include <cassert>
#include <iostream>

struct Base {
    virtual int f() const { return 1; }
    virtual ~Base() = default;
};

struct Derived : Base {
    int f() const override { return 2; }
};

struct Left {
    virtual int left() const { return 1; }
    virtual ~Left() = default;
};

struct Right {
    virtual int right() const { return 2; }
    virtual ~Right() = default;
};

struct Joined : Left, Right {
    int left() const override { return 10; }
    int right() const override { return 20; }
};

int main() {
    Derived derived;
    Base& base = derived;
    assert(base.f() == 2);

    Joined joined;
    Left* left = &joined;
    Right* right = &joined;
    assert(left->left() == 10);
    assert(right->right() == 20);
    // Recover the complete object through either polymorphic base.
    // No assumptions about byte offsets or vtable representation are needed.
    assert(dynamic_cast<void*>(left) == static_cast<void*>(&joined));
    assert(dynamic_cast<void*>(right) == static_cast<void*>(&joined));
    assert(dynamic_cast<Left*>(right) == left);

    std::cout << base.f() << '\n';
    std::cout << left->left() << ' ' << right->right() << '\n';
}
