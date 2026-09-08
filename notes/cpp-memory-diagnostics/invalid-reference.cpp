#include <vector>
#include <iostream>
int main() {
    std::vector<int> v{7};
    const auto capacity=v.capacity();
    while(v.size()<capacity) v.push_back(0);
    const int& ref=v[0];
    v.push_back(9);
    std::cout << ref << '\n'; // 故意的 UB：只用于检测器实验
}
