#include <cstddef>
#include <cstdint>
std::int64_t rows(const int* a, std::size_t n) {
    std::int64_t sum = 0;
    for (std::size_t i=0; i<n; ++i)
        for (std::size_t j=0; j<n; ++j) sum += a[i*n+j];
    return sum;
}
std::int64_t columns(const int* a, std::size_t n) {
    std::int64_t sum = 0;
    for (std::size_t j=0; j<n; ++j)
        for (std::size_t i=0; i<n; ++i) sum += a[i*n+j];
    return sum;
}
