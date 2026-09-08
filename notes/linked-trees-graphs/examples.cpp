#include <cassert>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <limits>
#include <memory>
#include <queue>
#include <stdexcept>
#include <unordered_map>
#include <utility>
#include <vector>

struct Node { int value; Node* next=nullptr; };
Node* reverse(Node* head) {
    Node* previous=nullptr;
    while (head) {
        Node* next=head->next;
        head->next=previous;
        previous=head;
        head=next;
    }
    return previous;
}
Node* reverse_recursive(Node* head) {
    if (!head || !head->next) return head;
    Node* new_head=reverse_recursive(head->next);
    head->next->next=head;
    head->next=nullptr;
    return new_head;
}
Node* merge(Node* a, Node* b) { // 两条升序、无环且节点互不重叠的链表
    Node dummy{0}; Node* tail=&dummy;
    while(a && b) {
        Node*& smaller=(a->value<=b->value ? a : b);
        tail->next=smaller;
        smaller=smaller->next;
        tail=tail->next;
    }
    tail->next=a ? a : b;
    return dummy.next;
}
Node* reverse_groups(Node* head, std::size_t k) {
    if (k==0) throw std::invalid_argument("k must be positive");
    Node dummy{0,head}; Node* before=&dummy;
    while (true) {
        Node* kth=before;
        for(std::size_t i=0; i<k && kth; ++i) kth=kth->next;
        if (!kth) break;
        Node* after=kth->next;
        Node* old_first=before->next;
        Node* current=old_first;
        Node* previous=after;
        while(current!=after) {
            Node* next=current->next;
            current->next=previous;
            previous=current;
            current=next;
        }
        before->next=kth;
        before=old_first;
    }
    return dummy.next;
}
Node* cycle_entry(Node* head) {
    Node* slow=head; Node* fast=head;
    while(fast && fast->next) {
        slow=slow->next; fast=fast->next->next;
        if (slow==fast) {
            Node* entry=head;
            while(entry!=slow) { entry=entry->next; slow=slow->next; }
            return entry;
        }
    }
    return nullptr;
}
struct Tree { int value; Tree* left=nullptr; Tree* right=nullptr; };
std::vector<int> max_sum_level(Tree* root) {
    if (!root) return {};
    std::queue<Tree*> queue; queue.push(root);
    std::int64_t best=std::numeric_limits<std::int64_t>::min();
    std::vector<int> answer;
    while(!queue.empty()) {
        auto width=queue.size();
        std::int64_t sum=0; std::vector<int> current;
        while(width--) {
            auto* node=queue.front(); queue.pop();
            sum+=node->value; current.push_back(node->value);
            if(node->left) queue.push(node->left);
            if(node->right) queue.push(node->right);
        }
        if(sum>best) { best=sum; answer=std::move(current); }
    }
    return answer;
}
struct GraphNode { int value; std::vector<GraphNode*> edges; };
struct GraphCopy {
    std::vector<std::unique_ptr<GraphNode>> storage;
    GraphNode* root=nullptr;
};
GraphCopy clone_graph(const GraphNode* root) {
    GraphCopy result;
    if(!root) return result;
    std::unordered_map<const GraphNode*,GraphNode*> copied;
    auto create=[&](const GraphNode* old) {
        result.storage.push_back(std::make_unique<GraphNode>(GraphNode{old->value,{}}));
        auto* fresh=result.storage.back().get();
        copied.emplace(old,fresh);
        return fresh;
    };
    result.root=create(root);
    std::queue<const GraphNode*> queue; queue.push(root);
    while(!queue.empty()) {
        const auto* old=queue.front(); queue.pop();
        auto* fresh=copied.at(old);
        for(const auto* next : old->edges) {
            if(!next) { fresh->edges.push_back(nullptr); continue; }
            if(copied.find(next)==copied.end()) { create(next); queue.push(next); }
            fresh->edges.push_back(copied.at(next));
        }
    }
    return result;
}

struct Nodes { // 测试用独立所有权；next 是借用，不递归析构
    std::vector<std::unique_ptr<Node>> storage;
    Node* make(std::initializer_list<int> values) {
        Node* head=nullptr; Node** tail=&head;
        for(int value : values) {
            storage.push_back(std::make_unique<Node>(Node{value}));
            *tail=storage.back().get(); tail=&(*tail)->next;
        }
        return head;
    }
};
std::vector<int> values(Node* head) {
    assert(cycle_entry(head)==nullptr);
    std::vector<int> out;
    for(;head;head=head->next) out.push_back(head->value);
    return out;
}
int main() {
    Nodes nodes;
    assert(reverse(nullptr)==nullptr && reverse_recursive(nullptr)==nullptr);
    auto* list=nodes.make({1,2,3});
    list=reverse(list); assert((values(list)==std::vector<int>{3,2,1}));
    list=reverse_recursive(list); assert((values(list)==std::vector<int>{1,2,3}));
    auto* merged=merge(nodes.make({1,3,5}),nodes.make({1,2,6}));
    assert((values(merged)==std::vector<int>{1,1,2,3,5,6}));
    assert(merge(nullptr,nullptr)==nullptr);
    auto* grouped=reverse_groups(nodes.make({1,2,3,4,5,6,7,8}),3);
    assert((values(grouped)==std::vector<int>{3,2,1,6,5,4,7,8}));
    assert((values(reverse_groups(nodes.make({1,2}),3))==std::vector<int>{1,2}));
    assert((values(reverse_groups(nodes.make({1}),1))==std::vector<int>{1}));
    bool rejected=false; try { reverse_groups(nullptr,0); }
    catch(const std::invalid_argument&) { rejected=true; } assert(rejected);
    Node a{1},b{2},c{3}; a.next=&b;b.next=&c;c.next=&b;
    assert(cycle_entry(&a)==&b); c.next=nullptr; assert(!cycle_entry(&a));
    a.next=&a; assert(cycle_entry(&a)==&a);
    Tree left{-2},right{-3},root{-1,&left,&right};
    assert((max_sum_level(&root)==std::vector<int>{-1}));
    root.value=-10; assert((max_sum_level(&root)==std::vector<int>{-2,-3}));
    root.value=-5; assert((max_sum_level(&root)==std::vector<int>{-5}));
    assert(max_sum_level(nullptr).empty());
    GraphNode x{1,{}},y{1,{}}; x.edges={&x,&y,&y,nullptr}; y.edges={&x};
    auto copy=clone_graph(&x);
    assert(copy.storage.size()==2 && copy.root!=&x);
    assert(copy.root->edges[0]==copy.root);
    auto* copy_y=copy.root->edges[1];
    assert(copy_y!=&y && copy_y!=copy.root && copy_y->edges[0]==copy.root);
    assert(copy.root->edges[2]==copy_y && copy.root->edges[3]==nullptr);
    copy.root->value=9; assert(x.value==1);
    assert(!clone_graph(nullptr).root);
}
