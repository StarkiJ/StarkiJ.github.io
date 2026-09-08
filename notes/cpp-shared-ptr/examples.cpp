#include <cassert>
#include <cstddef>
#include <memory>
#include <utility>

// 教学版本：单线程、单对象、同类型共享；不支持数组和 weak_ptr。
template<class T>
class Shared {
    struct Control { T* ptr; std::size_t strong; };
    Control* control_ = nullptr;
    void release() noexcept {
        if (control_ && --control_->strong == 0) {
            delete control_->ptr;
            delete control_;
        }
    }
public:
    Shared() noexcept = default;
    explicit Shared(T* ptr) {
        if (ptr) {
            std::unique_ptr<T> guard(ptr);
            control_ = new Control{ptr, 1};
            guard.release();
        }
    }
    Shared(const Shared& other) noexcept : control_(other.control_) {
        if (control_) ++control_->strong;
    }
    Shared(Shared&& other) noexcept
        : control_(std::exchange(other.control_, nullptr)) {}
    Shared& operator=(Shared other) noexcept {
        swap(other);
        return *this;
    }
    ~Shared() { release(); }
    void swap(Shared& other) noexcept { std::swap(control_, other.control_); }
    void reset() noexcept { Shared{}.swap(*this); }
    T* get() const noexcept { return control_ ? control_->ptr : nullptr; }
    T& operator*() const { return *get(); }  // 前提：非空
    T* operator->() const noexcept { return get(); }
    explicit operator bool() const noexcept { return get() != nullptr; }
    std::size_t use_count() const noexcept {
        return control_ ? control_->strong : 0;
    }
};
struct Item {
    inline static int live = 0;
    int value;
    explicit Item(int v) : value(v) { ++live; }
    ~Item() { --live; }
};
int main() {
    Shared<Item> empty;
    assert(!empty && empty.use_count() == 0);
    {
        Shared<Item> a(new Item(7));
        Shared<Item> b = a;
        assert(a.get() == b.get() && a.use_count() == 2);
        a = a;  // 自拷贝
        assert(a.use_count() == 2);
        Shared<Item> c = std::move(b);
        assert(!b && c.use_count() == 2);
        c = std::move(c);  // 本实现的自移动保持原值
        assert(c && c.use_count() == 2);
        Shared<Item> d(new Item(9));
        d = a;  // 原来的 Item(9) 必须释放
        assert(Item::live == 1 && d.use_count() == 3);
        a.reset();
        c.reset();
        assert(d.use_count() == 1 && d->value == 7);
        d = empty;
        assert(Item::live == 0);
    }
    assert(Item::live == 0);
}
