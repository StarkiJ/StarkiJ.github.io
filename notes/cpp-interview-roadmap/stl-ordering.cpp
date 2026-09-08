#include <algorithm>
#include <cassert>
#include <vector>
struct KV { int key; char value; };
int main() {
    std::vector<KV> v{{2,'a'}, {0,'x'}, {1,'b'}, {2,'c'}, {0,'y'}};
    auto end = std::stable_partition(v.begin(), v.end(),
                                   [](const KV& x) { return x.key != 0; });
    assert(end - v.begin() == 3);
    assert(v[0].value=='a' && v[1].value=='b' && v[2].value=='c');
    assert(v[3].value=='x' && v[4].value=='y');
    std::stable_sort(v.begin(), end,
                     [](const KV& a, const KV& b) { return a.key > b.key; });
    assert(v[0].value=='a' && v[1].value=='c' && v[2].value=='b');
}
