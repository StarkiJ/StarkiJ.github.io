#include <cassert>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <utility>
#include <vector>

// Handle 只属于创建它的 Pool，不能跨 Pool 或跨 Pool 生命周期使用。
class Pool {
    static constexpr std::size_t none = std::numeric_limits<std::size_t>::max();
    struct Slot { std::size_t dense = none; std::uint64_t generation = 1;
                  std::size_t next = none; };
    struct Entry { int value; std::size_t slot; };
    std::vector<Slot> slots_;
    std::vector<Entry> dense_;
    std::size_t free_ = none;
public:
    struct Handle { std::size_t slot; std::uint64_t generation; };
    Pool() = default;
    Pool(const Pool&) = delete;
    Pool& operator=(const Pool&) = delete;
    Pool(Pool&&) = delete;
    Pool& operator=(Pool&&) = delete;
    Handle add(int value) {
        const bool fresh = free_ == none;
        const auto id = fresh ? slots_.size() : free_;
        if (fresh) slots_.push_back(Slot{});
        try { dense_.push_back(Entry{value, id}); }
        catch (...) { if (fresh) slots_.pop_back(); throw; }
        auto& slot = slots_[id];
        if (!fresh) free_ = slot.next;
        slot.dense = dense_.size() - 1;
        slot.next = none;
        return {id, slot.generation};
    }
    int* get(Handle h) noexcept {
        if (h.slot >= slots_.size()) return nullptr;
        const auto& s = slots_[h.slot];
        if (s.dense == none || s.generation != h.generation) return nullptr;
        return &dense_[s.dense].value;
    }
    bool erase(Handle h) noexcept {
        if (!get(h)) return false;
        auto& s = slots_[h.slot];
        const auto pos = s.dense;
        const auto last = dense_.size() - 1;
        if (pos != last) {
            dense_[pos] = dense_[last];
            slots_[dense_[pos].slot].dense = pos;
        }
        dense_.pop_back();
        s.dense = none;
        if (s.generation != std::numeric_limits<std::uint64_t>::max()) {
            ++s.generation;
            s.next = free_;
            free_ = h.slot;
        } // generation 达到上限后退役槽位，禁止回绕复用
        return true;
    }
    void swap_positions(std::size_t a, std::size_t b) {
        if (a >= dense_.size() || b >= dense_.size()) throw std::out_of_range("position");
        std::swap(dense_[a], dense_[b]);
        slots_[dense_[a].slot].dense = a;
        slots_[dense_[b].slot].dense = b;
    }
    std::size_t size() const noexcept { return dense_.size(); }
};
int main() {
    Pool pool;
    auto a = pool.add(10);
    auto b = pool.add(20);
    auto c = pool.add(30);
    for (int i=0; i<2000; ++i) pool.add(i);
    assert(*pool.get(a)==10 && *pool.get(b)==20 && *pool.get(c)==30);
    pool.swap_positions(0, 2);
    assert(*pool.get(a)==10 && *pool.get(c)==30);
    assert(pool.erase(b));
    assert(!pool.get(b) && !pool.erase(b));
    auto replacement = pool.add(99);
    assert(replacement.slot==b.slot && replacement.generation!=b.generation);
    assert(!pool.get(b) && *pool.get(replacement)==99);
    assert(pool.erase(a) && pool.erase(c));
    assert(!pool.get(a) && !pool.get(c));
    Pool one;
    auto only = one.add(1);
    assert(one.erase(only) && one.size()==0 && !one.get(only));
    assert(!pool.get({999999, 1}));
}
