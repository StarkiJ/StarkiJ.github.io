#include <algorithm>
#include <cassert>
#include <cmath>
struct Point { double x,y; };
Point rotate_math(Point p,double radians) {
    const double c=std::cos(radians),s=std::sin(radians);
    return {c*p.x-s*p.y,s*p.x+c*p.y};
}
Point rotate_screen_ccw(Point p,double radians) {
    const double c=std::cos(radians),s=std::sin(radians);
    return {c*p.x+s*p.y,-s*p.x+c*p.y};
}
bool near(double a,double b) {
    return std::abs(a-b)<=1e-12+1e-10*std::max(std::abs(a),std::abs(b));
}
int main() {
    const double pi=std::acos(-1.0);
    const auto math=rotate_math({1,0},pi/2);
    assert(near(math.x,0) && near(math.y,1));
    const auto screen=rotate_screen_ccw({1,0},pi/2);
    assert(near(screen.x,0) && near(screen.y,-1));
    Point p{3,4};
    const auto q=rotate_math(p,0.73);
    assert(near(std::hypot(p.x,p.y),std::hypot(q.x,q.y)));
    const auto back=rotate_math(q,-0.73);
    assert(near(back.x,p.x) && near(back.y,p.y));
    auto cycle=p;
    for(int i=0;i<360;++i) cycle=rotate_math(cycle,pi/180);
    assert(near(cycle.x,p.x) && near(cycle.y,p.y));
}
