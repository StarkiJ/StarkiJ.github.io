#include <algorithm>
#include <array>
#include <cassert>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>
std::int64_t rows(const int*, std::size_t);
std::int64_t columns(const int*, std::size_t);
int main(int argc, char** argv) {
    const auto n = argc>1 ? std::stoul(argv[1]) : 1024ul;
    if (n<32 || n>8192) throw std::out_of_range("n must be 32..8192");
    std::mt19937 random(42);
    std::vector<int> a(n*n);
    std::int64_t expected = 0;
    for (auto& x : a) { x=static_cast<int>(random()%1024); expected+=x; }
    assert(rows(a.data(),n)==expected && columns(a.data(),n)==expected);
    using Fn=std::int64_t(*)(const int*,std::size_t);
    std::array<Fn,2> fn{rows,columns};
    std::array<std::vector<double>,2> time;
    std::int64_t checksum=0;
    for (int round=0; round<10; ++round) {
        std::array<int,2> order{0,1};
        std::shuffle(order.begin(),order.end(),random);
        for (int id : order) {
            const auto start=std::chrono::steady_clock::now();
            const auto result=fn[id](a.data(),n);
            const auto end=std::chrono::steady_clock::now();
            assert(result==expected);
            checksum+=result;
            time[id].push_back(std::chrono::duration<double,std::milli>(end-start).count());
        }
    }
    for (int id=0; id<2; ++id) {
        auto& t=time[id]; std::sort(t.begin(),t.end());
        std::cout << (id==0 ? "rows" : "columns") << " ms min/median/max: "
                  << t.front() << ' ' << (t[4]+t[5])/2 << ' ' << t.back() << '\n';
    }
    std::cout << "checksum: " << checksum << '\n';
}
