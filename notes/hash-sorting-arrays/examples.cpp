#include <algorithm>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <list>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

class LRU {
    using Entry=std::pair<int,int>;
    std::size_t capacity_;
    std::list<Entry> order_; // 最近使用在头部
    std::unordered_map<int,std::list<Entry>::iterator> index_;
public:
    explicit LRU(std::size_t capacity) : capacity_(capacity) {}
    LRU(const LRU&)=delete;
    LRU& operator=(const LRU&)=delete;
    LRU(LRU&&)=delete;
    LRU& operator=(LRU&&)=delete;
    std::optional<int> get(int key) {
        auto found=index_.find(key);
        if(found==index_.end()) return std::nullopt;
        order_.splice(order_.begin(),order_,found->second);
        return found->second->second;
    }
    void put(int key,int value) {
        if(capacity_==0) return;
        auto found=index_.find(key);
        if(found!=index_.end()) {
            found->second->second=value;
            order_.splice(order_.begin(),order_,found->second);
            return;
        }
        order_.emplace_front(key,value);
        try { index_.emplace(key,order_.begin()); }
        catch(...) { order_.pop_front(); throw; }
        if(order_.size()>capacity_) {
            index_.erase(order_.back().first);
            order_.pop_back();
        }
    }
    std::size_t size() const noexcept { return order_.size(); }
};
std::optional<std::int32_t> reverse_integer(std::int32_t x) {
    constexpr auto high=std::numeric_limits<std::int32_t>::max();
    constexpr auto low=std::numeric_limits<std::int32_t>::min();
    std::int32_t result=0;
    while(x!=0) {
        const auto digit=x%10;
        x/=10;
        if(result>high/10 || (result==high/10 && digit>high%10)) return std::nullopt;
        if(result<low/10 || (result==low/10 && digit<low%10)) return std::nullopt;
        result=result*10+digit;
    }
    return result;
}
std::string common_substring(const std::string& a,const std::string& b) {
    std::vector<std::size_t> dp(b.size()+1);
    std::size_t length=0,end=0;
    for(std::size_t i=1;i<=a.size();++i) {
        for(std::size_t j=b.size();j>0;--j) {
            dp[j]=(a[i-1]==b[j-1] ? dp[j-1]+1 : 0);
            if(dp[j]>length) { length=dp[j];end=i; }
        }
    }
    return a.substr(end-length,length);
}
std::size_t common_subsequence_length(const std::string& a,const std::string& b) {
    std::vector<std::size_t> dp(b.size()+1);
    for(char x : a) {
        std::size_t previous_diagonal=0;
        for(std::size_t j=1;j<=b.size();++j) {
            const auto previous_row=dp[j];
            dp[j]=(x==b[j-1] ? previous_diagonal+1 : std::max(dp[j],dp[j-1]));
            previous_diagonal=previous_row;
        }
    }
    return dp.back();
}
int main() {
    LRU cache(2);
    cache.put(1,10);cache.put(2,20);
    assert(cache.get(1)==10);
    cache.put(3,30);assert(!cache.get(2));
    cache.put(1,11);cache.put(4,40);
    assert(!cache.get(3) && cache.get(1)==11 && cache.get(4)==40 && cache.size()==2);
    LRU empty(0);empty.put(1,1);assert(!empty.get(1) && empty.size()==0);
    LRU one(1);one.put(1,1);one.put(1,9);assert(one.get(1)==9);
    one.put(2,2);assert(!one.get(1) && one.get(2)==2);
    assert(reverse_integer(12345)==54321);
    assert(reverse_integer(1200)==21);
    assert(reverse_integer(-120)==-21);
    assert(reverse_integer(0)==0);
    assert(!reverse_integer(1534236469));
    assert(!reverse_integer(std::numeric_limits<std::int32_t>::min()));
    assert(reverse_integer(1463847412)==2147483641);
    assert(reverse_integer(-2147483412)==-2143847412);
    assert(common_substring("xabcdz","yabcdw")=="abcd");
    assert(common_substring("abc","XYZ").empty());
    assert(common_substring("","abc").empty());
    assert(common_substring("aaaa","aa")=="aa");
    assert(common_subsequence_length("abcde","ace")==3);
    assert(common_subsequence_length("abc","abc")==3);
    assert(common_subsequence_length("abc","XYZ")==0);
    assert(common_subsequence_length("","a")==0);
}
