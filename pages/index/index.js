// index.js
// 导入配置
const config = require('../../config.js')

Page({
  data: {
    inputText: '',
    imageUrl: '',
    loading: false,
    canSubmit: false,
    cozeConfig: config.coze,  // 使用配置文件中的信息
    history: [], // 新增历史记录数组
    MAX_HISTORY: 9,  // 添加最大历史记录数量限制
    showModal: false,
    currentItem: null,
    currentIndex: -1
  },

  onLoad() {
    console.log('页面加载完成')
    // 加载本地存储的历史记录
    const history = wx.getStorageSync('imageHistory') || [];
    this.setData({ history });
  },

  handleInput(e) {
    const value = e.detail.value || ''
    console.log('输入内容:', value)
    
    this.setData({
      inputText: value,
      canSubmit: value && value.trim().length > 0
    }, () => {
      console.log('当前输入框内容:', this.data.inputText)
    })
  },

  // 处理提交按钮点击事件的异步函数
  async handleSubmit() {
    // 检查是否可以提交，如果输入框为空则返回
    if (!this.data.canSubmit || this.data.loading) return;
    
    // 设置加载状态为true，显示加载动画
    this.setData({ loading: true });
    
    // 保存当前输入
    const currentPrompt = this.data.inputText;
    
    // 显示全局loading提示框
    wx.showLoading({
      title: '正在生成...',
      mask: true  // 显示遮罩层防止用户重复点击
    });
    
    try {
      // 构建发送给API的请求数据对象
      const requestData = {
        workflow_id: this.data.cozeConfig.workflowId,  // 工作流ID
        user_id: "user_" + Date.now(),                 // 生成唯一的用户ID，使用时间戳
        parameters: {
          BOT_USER_INPUT: this.data.inputText          // 用户输入的文本，使用BOT_USER_INPUT作为参数名
        }
      };
      
      // 打印日志，用于调试
      console.log('发送的文本内容:', this.data.inputText);
      console.log('完整请求数据:', JSON.stringify(requestData, null, 2));
      
      // 使用Promise包装wx.request请求，方便使用async/await语法
      const result = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://api.coze.cn/v1/workflow/run',  // Coze API的地址
          method: 'POST',                              // 使用POST方法
          timeout: 30000,                              // 设置30秒超时
          header: {
            'Authorization': `Bearer ${this.data.cozeConfig.apiKey}`,  // 添加认证token
            'Content-Type': 'application/json'                         // 设置内容类型为JSON
          },
          data: requestData,  // 发送的数据
          // 请求成功的回调函数
          success: (res) => {
            if (res.statusCode === 200) {  // 如果状态码是200表示请求成功
              console.log('API响应成功:', JSON.stringify(res.data, null, 2));
              resolve(res);  // 将成功结果传递给Promise
            } else {
              console.error('API响应错误:', res);
              reject(new Error(`请求失败: ${res.statusCode}`));  // 抛出错误
            }
          },
          // 请求失败的回调函数
          fail: (err) => {
            console.error('请求失败:', err);
            // 如果是域名未校验的错误，给出特定提示
            if (err.errMsg.includes('url not in domain list')) {
              reject(new Error('请在开发者工具中勾选"不校验合法域名"'))
            } else {
              reject(err);  // 抛出其他错误
            }
          }
        });
      });

      // 处理API返回的结果
      if (result.statusCode === 200 && result.data) {
        const responseData = result.data;
        console.log('API返回的原始数据:', responseData);

        if (responseData.data) {
          try {
            const parsedData = JSON.parse(responseData.data);
            console.log('解析后的数据:', parsedData);

            const imageUrl = parsedData.output;
            console.log('提取的图片URL:', imageUrl);
            
            if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
              // 创建新的历史记录
              const newHistoryItem = {
                prompt: currentPrompt,
                imageUrl: imageUrl,
                timestamp: new Date().getTime()
              };
              
              // 限制历史记录数量
              let newHistory = [newHistoryItem, ...this.data.history];
              if (newHistory.length > this.data.MAX_HISTORY) {
                newHistory = newHistory.slice(0, this.data.MAX_HISTORY);
              }
              
              this.setData({
                imageUrl: imageUrl,
                history: newHistory,
                inputText: '',
                canSubmit: false
              }, () => {
                // 保存到本地存储
                wx.setStorageSync('imageHistory', newHistory);
                wx.showToast({
                  title: '生成成功',
                  icon: 'success'
                });
              });
            } else {
              throw new Error('无效的图片URL格式');
            }
          } catch (parseError) {
            console.error('解析数据失败:', parseError);
            throw new Error('返回数据格式不正确');
          }
        } else {
          throw new Error('API返回数据格式不正确');
        }
      } else {
        throw new Error(`请求失败: ${result.statusCode}`);
      }
    } catch (error) {
      console.error('生成失败:', error);
      wx.showModal({
        title: '生成失败',
        content: error.message || '请重试',
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
    }
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({
        urls: [url]
      });
    }
  },

  // 保存图片到相册的异步函数
  async saveImage() {
    // 如果没有图片URL则直接返回
    if (!this.data.imageUrl) return;
    
    try {
      // 获取用户的授权设置
      const setting = await wx.getSetting();
      // 如果没有保存到相册的权限，则请求授权
      if (!setting.authSetting['scope.writePhotosAlbum']) {
        await wx.authorize({
          scope: 'scope.writePhotosAlbum'
        });
      }
      
      // 显示保存中的提示
      wx.showLoading({ title: '保存中...' });
      
      // 先将图片下载到本地临时文件
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: this.data.imageUrl,  // 图片的URL
          success: (res) => {
            if (res.statusCode === 200) {  // 下载成功
              resolve(res);
            } else {
              reject(new Error('下载图片失败'));
            }
          },
          fail: (err) => {
            console.error('下载失败:', err);
            reject(err);
          }
        });
      });
      
      // 将下载的临时文件保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: downloadRes.tempFilePath,  // 临时文件路径
          success: (res) => {
            resolve(res);
          },
          fail: (err) => {
            console.error('保存失败:', err);
            reject(err);
          }
        });
      });
      
      // 显示保存成功的提示
      wx.showToast({
        title: '已保存到相册',
        icon: 'success'
      });
    } catch (error) {
      console.error('保存失败:', error);
      
      // 如果是权限被拒绝的错误
      if (error.errMsg && error.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存图片到相册',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();  // 打开设置页面让用户手动授权
            }
          }
        });
      } else {
        // 其他类型的错误
        wx.showModal({
          title: '保存失败',
          content: error.errMsg || '请重试',
          showCancel: false
        });
      }
    } finally {
      // 隐藏加载提示
      wx.hideLoading();
    }
  },

  onShareAppMessage() {
    return {
      title: '快来看看AI为我画的图片',
      imageUrl: this.data.imageUrl,
      path: '/pages/index/index'
    };
  },

  // 添加清空历史记录功能
  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] }, () => {
            wx.setStorageSync('imageHistory', []);
            wx.showToast({
              title: '已清空',
              icon: 'success'
            });
          });
        }
      }
    });
  },

  // 显示历史记录详情
  showHistoryDetail(e) {
    const item = e.currentTarget.dataset.item;
    const index = this.data.history.findIndex(h => h.timestamp === item.timestamp);
    this.setData({
      showModal: true,
      currentItem: item,
      currentIndex: index
    });
  },

  // 隐藏历史记录详情
  hideHistoryDetail() {
    this.setData({
      showModal: false,
      currentItem: null,
      currentIndex: -1
    });
  },

  // 阻止冒泡
  stopPropagation(e) {
    e.stopPropagation();
  }
})
