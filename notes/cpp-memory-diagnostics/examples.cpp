#include <cassert>
#include <cstddef>
#include <memory>
#include <vector>
class Base {
public:
    virtual ~Base() = default;
};
class Derived final : public Base {
public:
    inline static int destroyed=0;
    ~Derived() override { ++destroyed; }
};
int main() {
    { std::unique_ptr<Base> p=std::make_unique<Derived>(); }
    assert(Derived::destroyed==1);
    std::vector<int> v{7};
    const auto capacity=v.capacity();
    while(v.size()<capacity) v.push_back(0);
    const auto index=std::size_t{0};
    v.push_back(9); // 必须扩容，随后通过下标重新访问
    assert(v[ index ]==7 && v.capacity()>capacity);
}
